/**
 * Service S3 pour upload/backup de fichiers.
 * Configuration via variables d'environnement (aucun secret hardcodé).
 * Préfixe: schoolmatrix/ (profiles/, uploads/, backups/)
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type S3Folder = 'profiles' | 'uploads' | 'backups';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client | null = null;
  private bucket: string = '';
  private prefix: string = 'schoolmatrix/';
  private region: string = 'eu-west-1';
  private enabled = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const accessKey = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') ?? '';
    this.region = this.configService.get<string>('AWS_REGION') ?? 'eu-west-1';
    const raw = this.configService.get<string>('AWS_S3_PREFIX') ?? 'schoolmatrix';
    this.prefix = raw.replace(/\/?$/, '') + '/';

    if (!accessKey || !secretKey || !this.bucket) {
      // Normal : SchoolMatrix utilise GCS. S3 n’est plus le chemin principal.
      this.logger.log('S3 inactif (attendu — stockage cloud = GCS)');
      return;
    }
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
    this.enabled = true;
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Génère la clé S3 complète pour un fichier.
   * Ex: schoolmatrix/uploads/abc-123.jpg
   */
  buildS3Key(folder: S3Folder, filename: string): string {
    return `${this.prefix}${folder}/${filename}`;
  }

  /**
   * Upload un fichier vers S3.
   * Retourne la s3_key ou null si S3 désactivé.
   */
  async upload(
    folder: S3Folder,
    filename: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string | null> {
    if (!this.client || !this.enabled) return null;
    const key = this.buildS3Key(folder, filename);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType ?? 'application/octet-stream',
      }),
    );
    return key;
  }

  /**
   * Vérifie si un objet existe sur S3.
   */
  async exists(s3Key: string): Promise<boolean> {
    if (!this.client || !this.enabled) return false;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Génère une URL pré-signée pour téléchargement.
   */
  async getSignedUrl(s3Key: string, expiresIn = 3600): Promise<string | null> {
    if (!this.client || !this.enabled) return null;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
