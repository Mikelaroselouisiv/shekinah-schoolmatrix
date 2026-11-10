/** Le coefficient de la matière est le maximum des points. La moyenne se monte toujours sur 10. */
export function pointsToTen(obtained: number, bareme: number): number | null {
  if (!(bareme > 0) || obtained == null || Number.isNaN(obtained)) return null;
  return Math.round((obtained / bareme) * 10 * 100) / 100;
}

/** Le coefficient défini pour la matière prime sur celui copié dans la note. */
export function resolveBareme(opts: {
  gradeCoefficient?: number | null;
  classCoefficient?: number | null;
  points?: number | null;
}): number {
  const cc = Number(opts.classCoefficient) || 0;
  const gc = Number(opts.gradeCoefficient) || 0;
  if (cc > 0) return cc;
  if (gc > 0) return gc;
  return 0;
}
