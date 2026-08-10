/**
 * Stockage fichiers Google Cloud Storage (remplace S3).
 * Sur la VM GCP : ADC via compte de service de l’instance.
 * En local : GOOGLE_APPLICATION_CREDENTIALS ou gcloud ADC.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage, Bucket } from '@google-cloud/storage';

export type GcsFolder = 'profiles' | 'uploads' | 'backups';

@Injectable()
export class GcsService implements OnModuleInit {
  private readonly logger = new Logger(GcsService.name);
  private storage: Storage | null = null;
  private bucket: Bucket | null = null;
  private bucketName = '';
  private prefix = 'schoolmatrix/';
  private enabled = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.bucketName =
      this.configService.get<string>('GCS_BUCKET') ??
      this.configService.get<string>('GCS_ASSETS_BUCKET') ??
      '';
    const raw =
      this.configService.get<string>('GCS_PREFIX') ?? 'schoolmatrix';
    this.prefix = raw.replace(/\/?$/, '') + '/';

    if (!this.bucketName) {
      this.logger.warn('GCS désactivé: GCS_BUCKET manquant');
      return;
    }

    try {
      // ADC : VM SA / GOOGLE_APPLICATION_CREDENTIALS / gcloud user creds
      this.storage = new Storage({
        projectId:
          this.configService.get<string>('GCS_PROJECT_ID') ??
          this.configService.get<string>('GCP_PROJECT_ID') ??
          undefined,
      });
      this.bucket = this.storage.bucket(this.bucketName);
      this.enabled = true;
      this.logger.log(
        `GCS activé: gs://${this.bucketName}/${this.prefix}`,
      );
    } catch (err: any) {
      this.logger.warn(`GCS init échouée: ${err?.message || err}`);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.bucket !== null;
  }

  buildKey(folder: GcsFolder, filename: string): string {
    return `${this.prefix}${folder}/${filename}`;
  }

  /** URL publique (bucket en objectViewer public) ou gs://… */
  publicUrl(objectKey: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${objectKey}`;
  }

  async upload(
    folder: GcsFolder,
    filename: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string | null> {
    if (!this.bucket || !this.enabled) return null;
    const key = this.buildKey(folder, filename);
    const file = this.bucket.file(key);
    await file.save(buffer, {
      contentType: contentType ?? 'application/octet-stream',
      resumable: false,
      metadata: { cacheControl: 'public, max-age=3600' },
    });
    return key;
  }

  async exists(objectKey: string): Promise<boolean> {
    if (!this.bucket || !this.enabled) return false;
    try {
      const [ok] = await this.bucket.file(objectKey).exists();
      return ok;
    } catch {
      return false;
    }
  }

  async getSignedUrl(objectKey: string, expiresInSec = 3600): Promise<string | null> {
    if (!this.bucket || !this.enabled) return null;
    const [url] = await this.bucket.file(objectKey).getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresInSec * 1000,
    });
    return url;
  }

  async download(objectKey: string): Promise<Buffer | null> {
    if (!this.bucket || !this.enabled) return null;
    const [buf] = await this.bucket.file(objectKey).download();
    return buf;
  }
}
