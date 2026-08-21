/**
 * Code de gestion scolaire (public) — distinct du NISU (order_number, sensible).
 * Format : 8 caractères alphanumériques (lettres + chiffres), sans année.
 * Alphabet sans caractères ambigus (0/O, 1/I/L).
 */

import { randomInt } from 'crypto';

/** Lettres + chiffres lisibles (pas de 0, O, 1, I, L). */
export const STUDENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const STUDENT_CODE_LENGTH = 8;

export function normalizeStudentCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s\u00A0\-]+/g, '');
  return t || null;
}

/** Génère un code école aléatoire (~8 car. lettres + chiffres). */
export function generateStudentCode(length = STUDENT_CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += STUDENT_CODE_ALPHABET[randomInt(STUDENT_CODE_ALPHABET.length)];
  }
  return out;
}

/** Ancien format séquentiel avec année — à remplacer. */
export function isLegacyStudentCode(code: string | null | undefined): boolean {
  const t = normalizeStudentCode(code);
  if (!t) return false;
  if (/^EL\d{4}\d+$/i.test(t)) return true; // EL202600001 after normalize strips dashes
  if (/^EL-\d{4}-\d+$/i.test(String(code).trim())) return true;
  return false;
}
