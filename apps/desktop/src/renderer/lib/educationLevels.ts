export const EDUCATION_LEVELS = [
  { key: "PRESCOLAIRE", label: "Préscolaire" },
  { key: "FONDAMENTAL_1", label: "1er cycle fondamental" },
  { key: "FONDAMENTAL_2", label: "2e cycle fondamental" },
  { key: "FONDAMENTAL_3", label: "3e cycle fondamental" },
  { key: "SECONDAIRE", label: "Secondaire" },
  { key: "FORMATION_SUPERIEURE", label: "Formation supérieure" },
] as const;

export type EducationLevelKey = (typeof EDUCATION_LEVELS)[number]["key"];

export function educationLevelLabel(key?: string | null): string {
  if (!key) return "—";
  return EDUCATION_LEVELS.find((l) => l.key === key)?.label ?? key;
}
