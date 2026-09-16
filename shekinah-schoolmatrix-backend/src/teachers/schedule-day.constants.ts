import { BadRequestException } from '@nestjs/common';
import { CLASS_MOMENT_KINDS, ClassMomentKind } from './class-day-moment.entity';
import { SCHOOL_DUTY_KINDS, SchoolDutyKind } from './school-week-duty.entity';
import type { MorningDutyCycle } from '../roles/education-levels';

/** Horaires internes (non affichés) pour trier le début de journée avant les cours. */
export const MORNING_DUTY_START = '07:00';
export const MORNING_DUTY_END = '07:30';

/** Lundi → vendredi (semaine de classe). 0 = dimanche. */
export const CLASS_WEEKDAYS = [1, 2, 3, 4, 5] as const;

export const CLASS_MOMENT_LABELS: Record<ClassMomentKind, string> = {
  ENTRY: 'Rentrée',
  RECESS: 'Récréation',
  CLOSING: 'Prière de fin de journée',
};

export const SCHOOL_DUTY_LABELS: Record<SchoolDutyKind, string> = {
  ACCUEIL: 'Accueil',
  FLAG: 'Montée du drapeau',
  ANIMATION: 'Animation',
  SERVICE: 'Dames de service',
  DEVOTION: 'Dévotion',
  DEFI: 'Défi des 5 phrases',
  PRIERE: 'Prière de midi',
  RENTREE: 'Rentrée',
};

export function morningDutyTitle(
  kind: SchoolDutyKind | string,
  cycle?: string | null,
): string {
  const k = String(kind ?? '').toUpperCase();
  if (k === 'RENTREE' && cycle === 'PRESCOLAIRE') return 'Accueil préscolaire';
  if (k === 'RENTREE') return 'Accueil primaire';
  if (k === 'ACCUEIL' && cycle === 'PRESCOLAIRE') return 'Accueil préscolaire';
  if (k === 'ACCUEIL') return 'Accueil primaire';
  if (k === 'FLAG' && cycle === 'PRESCOLAIRE') return 'Montée du drapeau (préscolaire)';
  return SCHOOL_DUTY_LABELS[k as SchoolDutyKind] || k;
}

export function parseHhMm(raw: string | undefined, field = 'horaire'): string {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    throw new BadRequestException(`${field} invalide (HH:MM)`);
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    throw new BadRequestException(`${field} invalide (HH:MM)`);
  }
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function assertTimeRange(start: string, end: string): void {
  if (start >= end) {
    throw new BadRequestException('La fin doit être après le début');
  }
}

export function parseWeekday(day: number, field = 'day_of_week'): number {
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new BadRequestException(`${field} invalide (0–6)`);
  }
  return day;
}

export function parseClassMomentKind(kind: string | undefined): ClassMomentKind {
  const k = String(kind ?? '').trim().toUpperCase();
  if (!(CLASS_MOMENT_KINDS as readonly string[]).includes(k)) {
    throw new BadRequestException(
      'Type de moment invalide (ENTRY, RECESS, CLOSING)',
    );
  }
  return k as ClassMomentKind;
}

export function parseSchoolDutyKind(kind?: string | null): SchoolDutyKind {
  const k = String(kind ?? 'ACCUEIL').trim().toUpperCase();
  if (k === 'RENTREE') return 'ACCUEIL';
  if (!(SCHOOL_DUTY_KINDS as readonly string[]).includes(k)) {
    throw new BadRequestException('Type de responsabilité invalide');
  }
  return k as SchoolDutyKind;
}

export function parseMorningCycle(raw?: string | null): MorningDutyCycle {
  const k = String(raw ?? '').trim().toUpperCase();
  if (k !== 'PRESCOLAIRE' && k !== 'PRIMAIRE') {
    throw new BadRequestException('Cycle invalide (PRESCOLAIRE, PRIMAIRE)');
  }
  return k;
}

export function personName(
  u?: { first_name?: string | null; last_name?: string | null } | null,
): string | null {
  if (!u) return null;
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

export function cleanManualNames(raw?: string[] | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw ?? []) {
    const name = String(item ?? '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name.slice(0, 120));
  }
  return out;
}

export function cleanInstructionLines(raw?: string[] | null): string[] {
  return (raw ?? [])
    .map((s) => String(s ?? '').trim().replace(/[ \t]+/g, ' '))
    .filter(Boolean)
    .map((s) => s.slice(0, 2000));
}
