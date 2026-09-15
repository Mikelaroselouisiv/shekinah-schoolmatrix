export const PRESCHOOL_EVAL_LEVEL = 'LEVEL';
export const PRESCHOOL_EVAL_FREQUENCY = 'FREQUENCY';

export const PRESCHOOL_LEVELS = [
  { value: 'EXCELLENT', label: 'Excellent', abbr: 'EX' },
  { value: 'TRES_BIEN', label: 'Très bien', abbr: 'TB' },
  { value: 'BIEN', label: 'Bien', abbr: 'B' },
  { value: 'ASSEZ_BIEN', label: 'Assez bien', abbr: 'AB' },
] as const;

export const PRESCHOOL_FREQUENCIES = [
  { value: 'TOUJOURS', label: 'Toujours', abbr: 'TJ' },
  { value: 'SOUVENT', label: 'Souvent', abbr: 'SO' },
  { value: 'PARFOIS', label: 'Parfois', abbr: 'PF' },
  { value: 'JAMAIS', label: 'Jamais', abbr: 'JA' },
] as const;

export const YEAR_END_DECISIONS = [
  { value: 'ADMIS', label: 'Admis' },
  { value: 'ADMIS_AILLEURS', label: 'Admis ailleurs' },
  { value: 'REDOUBLER', label: 'Redoubler' },
  { value: 'AJOURNE', label: 'Ajourné' },
  { value: 'RENVOYE_DEFINITIVEMENT', label: 'Renvoyé définitivement' },
] as const;

const LEVEL_ALIASES: Record<string, string> = {
  A: 'BIEN',
  EA: 'TRES_BIEN',
  AB: 'ASSEZ_BIEN',
  NA: 'ASSEZ_BIEN',
  E: 'EXCELLENT',
  EX: 'EXCELLENT',
  TB: 'TRES_BIEN',
  B: 'BIEN',
  MOINSBIEN: 'ASSEZ_BIEN',
  MOINS_BIEN: 'ASSEZ_BIEN',
  TRESBIEN: 'TRES_BIEN',
};

const FREQUENCY_ALIASES: Record<string, string> = {
  REGULIER: 'TOUJOURS',
  OCCASIONNEL: 'PARFOIS',
  ENPROGRES: 'PARFOIS',
  TJ: 'TOUJOURS',
  SO: 'SOUVENT',
  PF: 'PARFOIS',
  JA: 'JAMAIS',
};

function key(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

export function preschoolLevelLabel(value?: string | null): string {
  if (!value) return '';
  const normalized = normalizePreschoolLevel(value);
  return PRESCHOOL_LEVELS.find((x) => x.value === normalized)?.label ?? value;
}

export function preschoolFrequencyLabel(value?: string | null): string {
  if (!value) return '';
  const normalized = normalizePreschoolFrequency(value);
  return PRESCHOOL_FREQUENCIES.find((x) => x.value === normalized)?.label ?? value;
}

export function normalizePreschoolLevel(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const byValue = PRESCHOOL_LEVELS.find(
    (x) =>
      x.value === raw ||
      x.label.toLowerCase() === raw.toLowerCase() ||
      x.abbr.toLowerCase() === raw.toLowerCase(),
  );
  if (byValue) return byValue.value;
  return LEVEL_ALIASES[key(raw)] ?? raw;
}

export function normalizePreschoolFrequency(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const byValue = PRESCHOOL_FREQUENCIES.find(
    (x) =>
      x.value === raw ||
      x.label.toLowerCase() === raw.toLowerCase() ||
      x.abbr.toLowerCase() === raw.toLowerCase(),
  );
  if (byValue) return byValue.value;
  return FREQUENCY_ALIASES[key(raw)] ?? raw;
}
