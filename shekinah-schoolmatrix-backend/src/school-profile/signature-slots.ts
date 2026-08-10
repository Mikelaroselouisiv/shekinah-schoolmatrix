/** Emplacements de signature prédéfinis (ordre d’affichage). */
export const FIXED_SIGNATURE_SLOTS = [
  {
    slot_key: 'directeur_general',
    default_role: 'Directeur / Directrice Général(e)',
    sort_order: 0,
  },
  {
    slot_key: 'econome',
    default_role: 'Économe',
    sort_order: 1,
  },
  {
    slot_key: 'coord_prescolaire',
    default_role: 'Coordonnateur / Coordonnatrice du préscolaire',
    sort_order: 2,
  },
  {
    slot_key: 'coord_fondamentale',
    default_role: 'Coordonnateur / Coordonnatrice du fondamentale',
    sort_order: 3,
  },
  {
    slot_key: 'coord_secondaire',
    default_role: 'Coordonnateur / Coordonnatrice du secondaire',
    sort_order: 4,
  },
] as const;

export const EXTRA_SIGNATURE_SLOT = 'extra';

export type FixedSignatureSlotKey =
  (typeof FIXED_SIGNATURE_SLOTS)[number]['slot_key'];
