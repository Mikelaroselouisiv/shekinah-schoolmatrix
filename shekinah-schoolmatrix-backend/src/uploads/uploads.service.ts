import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { StorageService } from '../storage/storage.service';
import { GcsService } from '../gcs/gcs.service';
import { S3Service } from '../s3/s3.service';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FileMetadata } from '../file-metadata/file-metadata.entity';
import { SyncKickService } from '../sync/sync-kick.service';
import {
  isRelativeUploadPath,
  resolveMediaUrl,
} from './media-url';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly gcs: GcsService,
    private readonly s3: S3Service,
    @InjectRepository(FileMetadata)
    private readonly fileMetaRepo: Repository<FileMetadata>,
    private readonly syncKick: SyncKickService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.normalizeStoredMediaUrls();
    } catch (err: any) {
      this.logger.warn(
        `Normalisation URLs médias ignorée: ${err?.message || err}`,
      );
    }
  }

  /**
   * Réécrit les chemins relatifs `uploads/…` en URL GCS publique
   * (users, school_profile, student) pour affichage Server ↔ Remote.
   */
  async normalizeStoredMediaUrls(): Promise<number> {
    const tables: Array<{ table: string; cols: string[] }> = [
      { table: 'users', cols: ['profile_photo_url', 'cover_photo_url'] },
      { table: 'school_profile', cols: ['logo_url'] },
      { table: 'school_signature', cols: ['image_url'] },
      {
        table: 'student',
        cols: [
          'photo_identity_student',
          'photo_identity_mother',
          'photo_identity_father',
          'photo_identity_responsible',
        ],
      },
    ];
    let updated = 0;
    for (const { table, cols } of tables) {
      const exists: Array<{ exists: boolean }> = await this.dataSource.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         ) AS exists`,
        [table],
      );
      if (!exists[0]?.exists) continue;

      for (const col of cols) {
        const colOk: Array<{ exists: boolean }> = await this.dataSource.query(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
           ) AS exists`,
          [table, col],
        );
        if (!colOk[0]?.exists) continue;

        const rows: Array<{ id: string | number; val: string }> =
          await this.dataSource.query(
            `SELECT id, "${col}" AS val FROM "${table}"
             WHERE "${col}" IS NOT NULL
               AND "${col}" <> ''
               AND "${col}" !~* '^https?://'`,
          );
        for (const row of rows) {
          const next = resolveMediaUrl(row.val);
          if (!next || next === row.val) continue;
          await this.dataSource.query(
            `UPDATE "${table}" SET "${col}" = $1 WHERE id = $2`,
            [next, row.id],
          );
          updated += 1;
        }
      }
    }
    if (updated > 0) {
      this.logger.log(`URLs médias normalisées → GCS: ${updated}`);
    }
    return updated;
  }

  /** URL affichable (relative → GCS). */
  resolvePublicUrl(stored: string | null | undefined): string | null {
    return resolveMediaUrl(stored);
  }

  async saveFile(
    buffer: Buffer,
    mimetype: string,
    originalName?: string,
  ): Promise<string> {
    const ext =
      EXT_BY_MIME[mimetype] ??
      (originalName ? path.extname(originalName).toLowerCase() : '.bin');
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(
      ext,
    )
      ? ext
      : '.jpg';
    const filename = `${randomUUID()}${safeExt}`;
    const filepath = this.storage.resolveLocalPath('uploads', filename);
    fs.writeFileSync(filepath, buffer);

    const relativePath = this.storage.getRelativePath('uploads', filename);

    let remoteKey: string | null = null;
    if (this.gcs.isEnabled()) {
      try {
        remoteKey = await this.gcs.upload(
          'uploads',
          filename,
          buffer,
          mimetype,
        );
      } catch (err: any) {
        this.logger.error(`GCS upload échoué: ${err?.message || err}`);
        throw new ServiceUnavailableException(
          'Stockage cloud indisponible — réessayez (image non publiée).',
        );
      }
      if (!remoteKey) {
        throw new ServiceUnavailableException(
          'Stockage cloud indisponible — réessayez (image non publiée).',
        );
      }
    } else if (this.s3.isEnabled()) {
      remoteKey = await this.s3.upload('uploads', filename, buffer, mimetype);
    }

    const meta = this.fileMetaRepo.create({
      local_path: relativePath,
      s3_key: remoteKey,
      sync_status: remoteKey ? 'synced' : 'local_only',
      last_synced_at: remoteKey ? new Date() : null,
      original_filename: originalName ?? null,
      mime_type: mimetype,
      size_bytes: buffer.length,
    });
    await this.fileMetaRepo.save(meta);
    this.syncKick.kick('upload');

    // GCS actif + upload OK → URL publique. Sinon chemin relatif (servi par /uploads local).
    if (remoteKey && this.gcs.isEnabled()) {
      return this.gcs.publicUrl(remoteKey);
    }
    return `uploads/${filename}`;
  }
}
