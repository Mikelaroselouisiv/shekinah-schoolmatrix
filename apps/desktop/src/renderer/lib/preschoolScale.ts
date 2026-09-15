export const PRESCHOOL_EVAL_LEVEL = "LEVEL";
export const PRESCHOOL_EVAL_FREQUENCY = "FREQUENCY";

export const PRESCHOOL_LEVELS = [
  { value: "MOINS_BIEN", label: "Moins bien" },
  { value: "BIEN", label: "Bien" },
  { value: "TRES_BIEN", label: "Très bien" },
  { value: "EXCELLENT", label: "Excellent" },
] as const;

export const PRESCHOOL_FREQUENCIES = [
  { value: "JAMAIS", label: "Jamais" },
  { value: "PARFOIS", label: "Parfois" },
  { value: "TOUJOURS", label: "Toujours" },
] as const;

export const YEAR_END_DECISIONS = [
  { value: "ADMIS", label: "Admis" },
  { value: "ADMIS_AILLEURS", label: "Admis ailleurs" },
  { value: "REDOUBLER", label: "Redoubler" },
  { value: "AJOURNE", label: "Ajourné" },
  { value: "RENVOYE_DEFINITIVEMENT", label: "Renvoyé définitivement" },
] as const;

const LEVEL_ALIASES: Record<string, string> = {
  A: "BIEN",
  EA: "TRES_BIEN",
  AB: "TRES_BIEN",
  NA: "MOINS_BIEN",
  E: "EXCELLENT",
};

const FREQUENCY_ALIASES: Record<string, string> = {
  REGULIER: "TOUJOURS",
  OCCASIONNEL: "PARFOIS",
  ENPROGRES: "PARFOIS",
};

function key(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

export function preschoolLevelLabel(value?: string | null): string {
  if (!value) return "";
  const normalized = normalizePreschoolLevel(value);
  return PRESCHOOL_LEVELS.find((x) => x.value === normalized)?.label ?? value;
}

export function preschoolFrequencyLabel(value?: string | null): string {
  if (!value) return "";
  const normalized = normalizePreschoolFrequency(value);
  return PRESCHOOL_FREQUENCIES.find((x) => x.value === normalized)?.label ?? value;
}

export function normalizePreschoolLevel(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const byValue = PRESCHOOL_LEVELS.find(
    (x) => x.value === raw || x.label.toLowerCase() === raw.toLowerCase(),
  );
  if (byValue) return byValue.value;
  return LEVEL_ALIASES[key(raw)] ?? raw;
}

export function normalizePreschoolFrequency(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const byValue = PRESCHOOL_FREQUENCIES.find(
    (x) => x.value === raw || x.label.toLowerCase() === raw.toLowerCase(),
  );
  if (byValue) return byValue.value;
  return FREQUENCY_ALIASES[key(raw)] ?? raw;
}
