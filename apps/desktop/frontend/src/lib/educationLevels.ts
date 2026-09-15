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

export function isHigherEducationLevel(level?: string | null): boolean {
  return (level ?? "").toUpperCase().trim() === "FORMATION_SUPERIEURE";
}

/** Formation supérieure : « étudiant » ; autres cycles : « élève ». */
export function learnerNoun(level?: string | null, plural = false): string {
  if (isHigherEducationLevel(level)) {
    return plural ? "étudiants" : "étudiant";
  }
  return plural ? "élèves" : "élève";
}

export function learnerNounCap(level?: string | null, plural = false): string {
  const n = learnerNoun(level, plural);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function isHomeroomCycle(level?: string | null): boolean {
  return !!level && (HOMEROOM_LEVELS as string[]).includes(level);
}

export const MATERIALS_LEVELS: EducationLevelKey[] = [
  "FONDAMENTAL_1",
  "FONDAMENTAL_2",
];

export function isMaterialsCycle(level?: string | null): boolean {
  return !!level && (MATERIALS_LEVELS as string[]).includes(level);
}
