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

export const SUBJECT_AUDIENCES = [
  { key: "PRESCOLAIRE", label: "Préscolaire" },
  { key: "PRIMAIRE", label: "Primaire" },
  { key: "SECONDAIRE", label: "Secondaire" },
  { key: "FORMATION_SUPERIEURE", label: "Formation supérieure" },
] as const;

export type SubjectAudience = (typeof SUBJECT_AUDIENCES)[number]["key"];

export function isSubjectAudience(value?: string | null): value is SubjectAudience {
  return !!value && SUBJECT_AUDIENCES.some((a) => a.key === value);
}

export function subjectAudienceFromLevel(level?: string | null): SubjectAudience {
  const key = (level ?? "").toUpperCase().trim();
  if (key === "PRESCOLAIRE") return "PRESCOLAIRE";
  if (key === "FONDAMENTAL_1" || key === "FONDAMENTAL_2") return "PRIMAIRE";
  if (key === "FONDAMENTAL_3" || key === "SECONDAIRE") return "SECONDAIRE";
  if (key === "FORMATION_SUPERIEURE") return "FORMATION_SUPERIEURE";
  return "PRIMAIRE";
}

export function subjectAudienceLabel(key?: string | null): string {
  if (!key) return "—";
  return SUBJECT_AUDIENCES.find((a) => a.key === key)?.label ?? key;
}

export const PERIOD_SCOPES = [
  { key: "PRESCOLAIRE", label: "Préscolaire" },
  { key: "ECOLE", label: "École" },
] as const;

export type PeriodScope = (typeof PERIOD_SCOPES)[number]["key"];

export function isPeriodScope(value?: string | null): value is PeriodScope {
  return !!value && PERIOD_SCOPES.some((s) => s.key === value);
}

export function periodScopeFromLevel(level?: string | null): PeriodScope {
  return (level ?? "").toUpperCase().trim() === "PRESCOLAIRE" ? "PRESCOLAIRE" : "ECOLE";
}

export function periodScopeLabel(key?: string | null): string {
  if (!key) return "—";
  return PERIOD_SCOPES.find((s) => s.key === key)?.label ?? key;
}

/** Matériel à apporter : 1er / 2e cycle (pas le préscolaire). */
export const MATERIALS_LEVELS: EducationLevelKey[] = [
  "FONDAMENTAL_1",
  "FONDAMENTAL_2",
];

export function isMaterialsCycle(level?: string | null): boolean {
  return !!level && (MATERIALS_LEVELS as string[]).includes(level);
}
