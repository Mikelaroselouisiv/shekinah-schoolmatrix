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

export function isEducationLevelKey(value?: string | null): value is EducationLevelKey {
  return !!value && (EDUCATION_LEVEL_KEYS as string[]).includes(value);
}

export function educationLevelLabel(key?: string | null): string {
  if (!key) return '—';
  return EDUCATION_LEVELS.find((l) => l.key === key)?.label ?? key;
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
