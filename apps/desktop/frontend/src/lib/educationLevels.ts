export const EDUCATION_LEVELS = [
  { key: "PRESCOLAIRE", label: "Préscolaire" },
  { key: "FONDAMENTAL_1", label: "1er cycle fondamental" },
  { key: "FONDAMENTAL_2", label: "2e cycle fondamental" },
  { key: "FONDAMENTAL_3", label: "3e cycle fondamental" },
  { key: "SECONDAIRE", label: "Secondaire" },
  { key: "FORMATION_SUPERIEURE", label: "Formation supérieure" },
] as const;

export type EducationLevelKey = (typeof EDUCATION_LEVELS)[number]["key"];

/** Titulaire de classe : toutes les matières, sauf décochage (anglais, espagnol, info…). */
export const HOMEROOM_LEVELS: EducationLevelKey[] = [
  "PRESCOLAIRE",
  "FONDAMENTAL_1",
  "FONDAMENTAL_2",
];

export function educationLevelLabel(key?: string | null): string {
  if (!key) return "—";
  return EDUCATION_LEVELS.find((l) => l.key === key)?.label ?? key;
}

export function isHomeroomCycle(level?: string | null): boolean {
  return !!level && (HOMEROOM_LEVELS as string[]).includes(level);
}
