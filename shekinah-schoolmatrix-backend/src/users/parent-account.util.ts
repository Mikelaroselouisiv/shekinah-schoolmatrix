/**
 * Comptes parent auto à l’inscription.
 * Email : prenom.nom@institutionmixteshekinah.com
 * Mot de passe temporaire : system12
 */

export const AUTO_PARENT_PASSWORD = 'system12';
export const INSTITUTION_EMAIL_DOMAIN = 'institutionmixteshekinah.com';

/** Enlève accents / ponctuation → slug email (a-z0-9). */
export function slugEmailPart(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
  return s || 'user';
}

export function buildInstitutionEmail(firstName: string, lastName: string, suffix?: string): string {
  const f = slugEmailPart(firstName);
  const l = slugEmailPart(lastName);
  const base = `${f}.${l}`;
  const local = suffix ? `${base}.${slugEmailPart(suffix)}` : base;
  return `${local}@${INSTITUTION_EMAIL_DOMAIN}`;
}

/** Découpe "Marie Claire JOSEPH" → prénom / nom. */
export function splitPersonName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '—', last_name: '—' };
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}
