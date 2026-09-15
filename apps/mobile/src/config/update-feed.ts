/**
 * Feed MAJ APK (équivalent electron-updater desktop Remote/Server).
 * Bucket tenant Shekinah — ne pas inventer d’autre bucket.
 */
export const GCS_ASSETS_BUCKET = 'shekinah-schoolmatrix-assets';

export const MOBILE_UPDATE_FEED_URL = `https://storage.googleapis.com/${GCS_ASSETS_BUCKET}/installers/mobile/latest.json`;

export type MobileUpdateManifest = {
  version: string;
  versionCode: number;
  apkUrl: string;
  notes?: string;
  sha256?: string;
  size?: number;
  publishedAt?: string;
  mandatory?: boolean;
};
