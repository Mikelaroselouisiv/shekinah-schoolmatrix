/**
 * Harmonise les URLs médias entre Server et Remote.
 * Source unique d’affichage : URL publique GCS quand l’objet est sous schoolmatrix/uploads/.
 */

const DEFAULT_BUCKET = 'shekinah-schoolmatrix-assets';
const DEFAULT_PREFIX = 'schoolmatrix';

export function gcsPublicBase(
  bucket = process.env.GCS_BUCKET || DEFAULT_BUCKET,
  prefix = process.env.GCS_PREFIX || DEFAULT_PREFIX,
): string {
  const b = (bucket || DEFAULT_BUCKET).trim();
  const p = (prefix || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, '');
  return `https://storage.googleapis.com/${b}/${p}`;
}

/** Extrait `uuid.ext` depuis uploads/…, /uploads/…, ou URL GCS. */
export function extractUploadFilename(stored: string): string | null {
  const s = stored.trim();
  if (!s) return null;
  const rel = s.match(/^(?:\/)?uploads\/([^/?#]+)$/i);
  if (rel) return rel[1];
  const gcs = s.match(
    /storage\.googleapis\.com\/[^/]+\/[^/]+\/uploads\/([^/?#]+)$/i,
  );
  if (gcs) return gcs[1];
  return null;
}

export function isRelativeUploadPath(stored: string): boolean {
  const s = stored.trim();
  return /^(?:\/)?uploads\/[^/?#]+$/i.test(s);
}

/**
 * Convertit un chemin stocké en URL affichable des deux côtés.
 * - http(s) → tel quel
 * - uploads/x → URL publique GCS
 * - autre → inchangé
 */
export function resolveMediaUrl(
  stored: string | null | undefined,
  opts?: { bucket?: string; prefix?: string },
): string | null {
  if (stored == null) return null;
  const s = String(stored).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const filename = extractUploadFilename(s);
  if (filename) {
    return `${gcsPublicBase(opts?.bucket, opts?.prefix)}/uploads/${filename}`;
  }
  return s;
}

/** Champs métier connus qui peuvent contenir une URL image. */
export const MEDIA_URL_FIELDS = new Set([
  'logo_url',
  'profile_photo_url',
  'cover_photo_url',
  'photo_identity_student',
  'photo_identity_mother',
  'photo_identity_father',
  'photo_identity_responsible',
]);

export function normalizeMediaFieldsInPlace(
  data: Record<string, unknown>,
  opts?: { bucket?: string; prefix?: string },
): void {
  for (const key of Object.keys(data)) {
    if (!MEDIA_URL_FIELDS.has(key) && !/_url$/i.test(key) && !/^photo_/i.test(key)) {
      continue;
    }
    const v = data[key];
    if (typeof v !== 'string' || !v.trim()) continue;
    const resolved = resolveMediaUrl(v, opts);
    if (resolved) data[key] = resolved;
  }
}
