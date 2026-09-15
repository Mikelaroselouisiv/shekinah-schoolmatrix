/**
 * Niveaux d’enseignement (Haïti) — stockés dans `class.level`
 * et dans `role.education_levels` (périmètre du responsable).
 *
 * `null` / tableau vide sur le rôle = pas de restriction de niveau
 * (direction générale, ou rôle auquel on n’a pas encore borné le cycle).
 */
export const EDUCATION_LEVELS = [
  { key: 'PRESCOLAIRE', label: 'Préscolaire' },
  { key: 'FONDAMENTAL_1', label: '1er cycle fondamental' },
  { key: 'FONDAMENTAL_2', label: '2e cycle fondamental' },
  { key: 'FONDAMENTAL_3', label: '3e cycle fondamental' },
  { key: 'SECONDAIRE', label: 'Secondaire' },
  { key: 'FORMATION_SUPERIEURE', label: 'Formation supérieure' },
] as const;

export type EducationLevelKey = (typeof EDUCATION_LEVELS)[number]['key'];

export const EDUCATION_LEVEL_KEYS: EducationLevelKey[] = EDUCATION_LEVELS.map(
  (l) => l.key,
);

/**
 * Répartition habituelle en Haïti :
 * - Directeur pédagogique du primaire → 1er et 2e cycles fondamental
 * - Directeur pédagogique du secondaire → 3e cycle fondamental + secondaire
 */
export const LEVELS_PEDAGOGIQUE_PRIMAIRE: EducationLevelKey[] = [
  'FONDAMENTAL_1',
  'FONDAMENTAL_2',
];

export const LEVELS_PEDAGOGIQUE_SECONDAIRE: EducationLevelKey[] = [
  'FONDAMENTAL_3',
  'SECONDAIRE',
];

export function isEducationLevelKey(value?: string | null): value is EducationLevelKey {
  return !!value && (EDUCATION_LEVEL_KEYS as string[]).includes(value);
}

/** Début de journée (drapeau + rentrée) : préscolaire et primaire seulement. */
export const MORNING_OPENING_LEVELS: EducationLevelKey[] = [
  'PRESCOLAIRE',
  'FONDAMENTAL_1',
  'FONDAMENTAL_2',
];

export const MORNING_PRIMAIRE_LEVELS: EducationLevelKey[] = [
  'FONDAMENTAL_1',
  'FONDAMENTAL_2',
];

export type MorningDutyCycle = 'PRESCOLAIRE' | 'PRIMAIRE';

export function morningCycleFromLevel(
  level?: string | null,
): MorningDutyCycle | null {
  const key = (level ?? '').toUpperCase().trim();
  if (key === 'PRESCOLAIRE') return 'PRESCOLAIRE';
  if (key === 'FONDAMENTAL_1' || key === 'FONDAMENTAL_2') return 'PRIMAIRE';
  return null;
}

export function isMorningOpeningLevel(level?: string | null): boolean {
  return !!level && (MORNING_OPENING_LEVELS as string[]).includes(level);
}

/** Appel sur l’app : préscolaire + 1er / 2e cycles fondamentaux. */
export const ATTENDANCE_LEVELS: EducationLevelKey[] = [
  'PRESCOLAIRE',
  'FONDAMENTAL_1',
  'FONDAMENTAL_2',
];

/** Horaire chiffré (créneaux horaires) : 3e cycle, secondaire, formation supérieure. */
export const TIMED_SCHEDULE_LEVELS: EducationLevelKey[] = [
  'FONDAMENTAL_3',
  'SECONDAIRE',
  'FORMATION_SUPERIEURE',
];

/** Matières en liste, sans heure : préscolaire + 1er / 2e cycles. */
export const LIST_SCHEDULE_LEVELS: EducationLevelKey[] = [
  'PRESCOLAIRE',
  'FONDAMENTAL_1',
  'FONDAMENTAL_2',
];

export function isTimedScheduleLevel(level?: string | null): boolean {
  return !!level && (TIMED_SCHEDULE_LEVELS as string[]).includes(level);
}

export function isListScheduleLevel(level?: string | null): boolean {
  return !!level && (LIST_SCHEDULE_LEVELS as string[]).includes(level);
}

/** Liste de matériel accompagnant l’horaire : préscolaire + 1er / 2e cycles. */
export const MATERIALS_LEVELS: EducationLevelKey[] = [...LIST_SCHEDULE_LEVELS];

export function isAttendanceLevel(level?: string | null): boolean {
  return !!level && (ATTENDANCE_LEVELS as string[]).includes(level);
}

export function isMaterialsLevel(level?: string | null): boolean {
  return !!level && (MATERIALS_LEVELS as string[]).includes(level);
}

export function educationLevelLabel(key?: string | null): string {
  if (!key) return '—';
  return EDUCATION_LEVELS.find((l) => l.key === key)?.label ?? key;
}

export function isHigherEducationLevel(level?: string | null): boolean {
  return (level ?? '').toUpperCase().trim() === 'FORMATION_SUPERIEURE';
}

/** Formation supérieure : « étudiant » ; autres cycles : « élève ». */
export function learnerNoun(level?: string | null, plural = false): string {
  if (isHigherEducationLevel(level)) {
    return plural ? 'étudiants' : 'étudiant';
  }
  return plural ? 'élèves' : 'élève';
}

export function learnerNounCap(level?: string | null, plural = false): string {
  const n = learnerNoun(level, plural);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function normalizeEducationLevels(
  values?: string[] | null,
): EducationLevelKey[] | null {
  if (!values || values.length === 0) return null;
  const unique = [
    ...new Set(values.filter((v): v is EducationLevelKey => isEducationLevelKey(v))),
  ];
  return unique.length ? unique : null;
}

export function educationLevelsEqual(
  a?: string[] | null,
  b?: string[] | null,
): boolean {
  const na = normalizeEducationLevels(a);
  const nb = normalizeEducationLevels(b);
  if (!na && !nb) return true;
  if (!na || !nb || na.length !== nb.length) return false;
  return [...na].sort().join(',') === [...nb].sort().join(',');
}
