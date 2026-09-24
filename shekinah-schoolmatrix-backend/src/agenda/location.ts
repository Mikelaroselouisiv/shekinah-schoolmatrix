import { BadRequestException } from '@nestjs/common';

export type LocationKind = 'SCHOOL' | 'OTHER';

export function normalizeLocation(kind?: string | null, text?: string | null): {
  location_kind: LocationKind;
  location_text: string | null;
  location_label: string;
} {
  const location_kind: LocationKind = kind === 'OTHER' ? 'OTHER' : 'SCHOOL';
  const location_text =
    location_kind === 'OTHER' ? (text ?? '').trim().slice(0, 200) || null : null;
  if (location_kind === 'OTHER' && !location_text) {
    throw new BadRequestException('Indiquez le lieu');
  }
  return {
    location_kind,
    location_text,
    location_label: location_kind === 'SCHOOL' ? "À l'école" : location_text!,
  };
}

export function isoDate(value?: string | null, required = true): string | null {
  const s = String(value ?? '').trim().slice(0, 10);
  if (!s) {
    if (required) throw new BadRequestException('Date invalide');
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestException('Date invalide');
  }
  return s;
}
