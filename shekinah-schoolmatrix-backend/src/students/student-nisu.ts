/**
 * NISU (Numéro d'Identification du Système Unique) — code élève unique en Haïti.
 * Toujours normaliser avant lecture / écriture pour éviter les doublons
 * (espaces, casse, etc.).
 */
export function normalizeNisu(raw: string | null | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/[\s\u00A0]+/g, '')
    .toUpperCase();
}

export function isPostgresUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '23505' || e?.driverError?.code === '23505';
}
