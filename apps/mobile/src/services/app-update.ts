import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  MOBILE_UPDATE_FEED_URL,
  type MobileUpdateManifest,
} from '../config/update-feed';

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268435456;
const APK_DEST = `${FileSystem.cacheDirectory ?? ''}pending-update.apk`;

export type UpdateProgress = {
  /** 0..1 */
  ratio: number;
  written: number;
  total: number;
};

function isNativeApkRelease(): boolean {
  if (__DEV__) return false;
  if (Platform.OS !== 'android') return false;
  if (Constants.appOwnership === 'expo') return false;
  return true;
}

export function getApplicationId(): string {
  return (
    Application.applicationId ||
    Constants.expoConfig?.android?.package ||
    'com.shekinah.schoolmatrix'
  );
}

export function currentVersionCode(): number {
  const raw = Application.nativeBuildVersion;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function trustedApkHost(): string {
  try {
    return new URL(MOBILE_UPDATE_FEED_URL).host;
  } catch {
    return 'storage.googleapis.com';
  }
}

function isValidManifest(data: Partial<MobileUpdateManifest>): data is MobileUpdateManifest {
  if (
    typeof data.version !== 'string' ||
    typeof data.versionCode !== 'number' ||
    typeof data.apkUrl !== 'string' ||
    !data.apkUrl
  ) {
    return false;
  }
  try {
    const u = new URL(data.apkUrl);
    if (u.protocol !== 'https:') return false;
    if (u.host !== trustedApkHost()) return false;
    if (!u.pathname.toLowerCase().endsWith('.apk')) return false;
  } catch {
    return false;
  }
  return true;
}

/** `null` si hors Android Release / pas de MAJ / erreur silencieuse. */
export async function checkForUpdate(): Promise<MobileUpdateManifest | null> {
  if (!isNativeApkRelease()) return null;
  try {
    const res = await fetch(MOBILE_UPDATE_FEED_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<MobileUpdateManifest>;
    if (!isValidManifest(data)) return null;
    if (data.versionCode <= currentVersionCode()) return null;
    return {
      version: data.version,
      versionCode: data.versionCode,
      apkUrl: data.apkUrl,
      notes: typeof data.notes === 'string' ? data.notes : undefined,
      sha256: typeof data.sha256 === 'string' ? data.sha256 : undefined,
      size: typeof data.size === 'number' ? data.size : undefined,
      publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : undefined,
      mandatory: data.mandatory === true,
    };
  } catch {
    return null;
  }
}

async function launchInstaller(fileUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}

export async function openUnknownSourcesSettings(): Promise<void> {
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
    { data: `package:${getApplicationId()}` },
  );
}

export function isLikelyUnknownSourcesError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('install') ||
    lower.includes('package') ||
    lower.includes('permission') ||
    lower.includes('unknown') ||
    lower.includes('security')
  );
}

/**
 * Télécharge l’APK dans le cache app puis ouvre l’installateur système.
 * Ne jamais ouvrir le navigateur.
 */
export async function downloadAndInstallApk(
  manifest: MobileUpdateManifest,
  onProgress?: (p: UpdateProgress) => void,
): Promise<void> {
  if (!isNativeApkRelease()) {
    throw new Error('Mise à jour APK réservée à Android Release');
  }
  if (!APK_DEST) {
    throw new Error('Cache fichier indisponible');
  }

  await FileSystem.deleteAsync(APK_DEST, { idempotent: true });

  const task = FileSystem.createDownloadResumable(
    manifest.apkUrl,
    APK_DEST,
    {},
    (p) => {
      const expected =
        p.totalBytesExpectedToWrite > 0
          ? p.totalBytesExpectedToWrite
          : manifest.size && manifest.size > 0
            ? manifest.size
            : 0;
      const total = expected > 0 ? expected : Math.max(p.totalBytesWritten, 1);
      onProgress?.({
        ratio: Math.min(1, p.totalBytesWritten / total),
        written: p.totalBytesWritten,
        total,
      });
    },
  );

  const result = await task.downloadAsync();
  if (!result?.uri) {
    throw new Error('Téléchargement APK échoué');
  }

  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists) {
    throw new Error('APK introuvable après téléchargement');
  }
  if (typeof manifest.size === 'number' && manifest.size > 0 && info.size !== manifest.size) {
    throw new Error('APK incomplet');
  }

  onProgress?.({
    ratio: 1,
    written: info.size ?? manifest.size ?? 0,
    total: info.size ?? manifest.size ?? 0,
  });

  await launchInstaller(result.uri);
}

/** Si un APK est encore en cache (retour des réglages), relancer l’install. */
export async function resumePendingInstallerIfAny(): Promise<boolean> {
  if (!isNativeApkRelease() || !APK_DEST) return false;
  const info = await FileSystem.getInfoAsync(APK_DEST);
  if (!info.exists || !info.size) return false;
  await launchInstaller(APK_DEST);
  return true;
}

export function subscribeAppActive(onActive: () => void): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') onActive();
  });
  return () => sub.remove();
}
