export const PRESCHOOL_EVAL_LEVEL = 'LEVEL';
export const PRESCHOOL_EVAL_FREQUENCY = 'FREQUENCY';

export const PRESCHOOL_LEVELS = [
  { value: 'MOINS_BIEN', label: 'Moins bien' },
  { value: 'BIEN', label: 'Bien' },
  { value: 'TRES_BIEN', label: 'Très bien' },
  { value: 'EXCELLENT', label: 'Excellent' },
] as const;

export const PRESCHOOL_FREQUENCIES = [
  { value: 'JAMAIS', label: 'Jamais' },
  { value: 'PARFOIS', label: 'Parfois' },
  { value: 'TOUJOURS', label: 'Toujours' },
] as const;

export const YEAR_END_DECISIONS = [
  { value: 'ADMIS', label: 'Admis' },
  { value: 'ADMIS_AILLEURS', label: 'Admis ailleurs' },
  { value: 'REDOUBLER', label: 'Redoubler' },
  { value: 'AJOURNE', label: 'Ajourné' },
  { value: 'RENVOYE_DEFINITIVEMENT', label: 'Renvoyé définitivement' },
] as const;
