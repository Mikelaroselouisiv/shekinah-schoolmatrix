/** Format monétaire FR (HTG / nombre local). */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Date ISO / Date → JJ/MM/AAAA */
export function formatDateJJMMAAAA(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    // déjà JJ/MM/AAAA ?
    if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
    return String(value);
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatTodayLong(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Date locale → YYYY-MM-DD (API attendance). */
export function toYYYYMMDD(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse YYYY-MM-DD → Date locale (midi pour éviter les décalages TZ). */
export function parseYYYYMMDD(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function shiftYYYYMMDD(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toYYYYMMDD(dt);
}

export function yyyymmddToJJMMAAAA(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-DD → JJ/MM/AAAA pour champ éditable (vide → ""). */
export function toDisplayDateJJMMAAAA(isoDate: string | null | undefined): string {
  if (!isoDate || !String(isoDate).trim()) return '';
  const s = String(isoDate).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * JJ/MM/AAAA ou JJ-MM-AAAA → YYYY-MM-DD (null si invalide).
 * Accepte aussi YYYY-MM-DD déjà formaté.
 */
export function parseJJMMAAAAToIso(jjMmAaaa: string): string | null {
  const trimmed = jjMmAaaa.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const dd = Number(d);
  const mm = Number(m);
  const yyyy = Number(y);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) {
    return null;
  }
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function studentDisplayName(s: {
  first_name?: string;
  last_name?: string;
}): string {
  return [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Élève';
}
