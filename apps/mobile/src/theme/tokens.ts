/**
 * Palette douce Shekinah — pas de bleu.
 * La couleur « flamme » d’établissement est un accent secondaire, jamais le chrome principal.
 */
export const colors = {
  bg: '#F5F3F1',
  surface: '#FFFFFF',
  text: '#1C1917',
  textMuted: '#78716C',
  border: '#E7E5E4',
  danger: '#B91C1C',
  dangerBg: '#FEF2F2',
  success: '#3F6212',
  /** Encre douce pour chrome UI (onglets, CTA, titres d’action) */
  ink: '#2C2926',
  inkSoft: '#57534E',
  /** Flamme adoucie — accent secondaire uniquement */
  flame: '#B85A48',
  flameMuted: '#C47A6A',
  flameTint: '#F7EEEB',
  /** Fallbacks (remplacent l’ancien bleu) */
  primaryFallback: '#2C2926',
  secondaryFallback: '#B85A48',
};

export type SchoolTheme = {
  /** Chrome UI : encre douce (pas la flamme) */
  primary: string;
  /** Accent secondaire établissement (flamme / marque) */
  secondary: string;
  /** Alias explicite de la flamme / marque */
  accent: string;
  accentTint: string;
};

/** Mélange une couleur hex avec du blanc (0 = pure, 1 = blanc). */
export function softTint(hex: string, whiteMix = 0.88): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return colors.surface;
  const n = parseInt(raw, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * whiteMix);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * primary_color école = marque / flamme → secondary + accent (usage rare).
 * Le chrome (primary) reste toujours l’encre douce pour une apparence plus calme.
 */
export function buildTheme(
  schoolPrimary?: string | null,
  schoolSecondary?: string | null,
): SchoolTheme {
  const accent = schoolPrimary?.trim() || colors.flame;
  const secondary = schoolSecondary?.trim() || colors.flameMuted;
  return {
    primary: colors.ink,
    secondary,
    accent,
    accentTint: softTint(accent, 0.9),
  };
}
