/** Barème haïtien : le coefficient est la note maximale de la matière (100 à 500). */
export const DEFAULT_BAREME = 100;
export const BAREME_PRESETS = [100, 200, 300, 400, 500] as const;

export function pointsToTen(obtained: number, bareme: number): number | null {
  if (!(bareme > 0) || obtained == null || Number.isNaN(obtained)) return null;
  return Math.round((obtained / bareme) * 10 * 100) / 100;
}

/**
 * Le coefficient enregistré sur une note peut être un reliquat (1 ou 10).
 * On privilégie le barème de la matière (table coefficients) dès qu’il est un vrai 100–500.
 */
export function resolveBareme(opts: {
  gradeCoefficient?: number | null;
  classCoefficient?: number | null;
  points?: number | null;
}): number {
  const gc = Number(opts.gradeCoefficient) || 0;
  const cc = Number(opts.classCoefficient) || 0;
  const pts = Number(opts.points) || 0;

  if (cc >= 50 && (gc < 50 || gc === 0)) return cc;
  if (gc >= 50) return gc;
  if (cc > 0) return cc;

  if (pts > 10 && gc > 0 && gc < 50 && pts > gc) {
    if (pts <= 100) return 100;
    if (pts <= 200) return 200;
    if (pts <= 300) return 300;
    if (pts <= 400) return 400;
    return 500;
  }

  if (gc > 0) return gc;
  return DEFAULT_BAREME;
}
