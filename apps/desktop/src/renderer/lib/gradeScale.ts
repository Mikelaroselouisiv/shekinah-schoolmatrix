export const DEFAULT_BAREME = 100;
export const BAREME_PRESETS = [100, 200, 300, 400, 500] as const;

export function pointsToTen(obtained: number | null | undefined, bareme: number | null | undefined): number | null {
  if (obtained == null || Number.isNaN(Number(obtained))) return null;
  const b = Number(bareme);
  if (!(b > 0)) return null;
  return Math.round((Number(obtained) / b) * 10 * 100) / 100;
}

export function formatPointsOnBareme(
  obtained: number | null | undefined,
  bareme: number | null | undefined,
): string {
  if (obtained == null || bareme == null) return "—";
  const ten = pointsToTen(obtained, bareme);
  return ten == null ? `${obtained}/${bareme}` : `${obtained}/${bareme} (${ten.toFixed(2)}/10)`;
}
