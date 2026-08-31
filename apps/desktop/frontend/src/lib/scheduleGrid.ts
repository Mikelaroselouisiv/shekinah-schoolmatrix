/** Jours affichés dans la grille horaire (lundi → samedi). */
export const SCHEDULE_DAYS = [
  { index: 1, label: "Lundi" },
  { index: 2, label: "Mardi" },
  { index: 3, label: "Mercredi" },
  { index: 4, label: "Jeudi" },
  { index: 5, label: "Vendredi" },
  { index: 6, label: "Samedi" },
] as const;

/** Créneaux d’une heure de 07:00 à 19:00. */
export const SCHEDULE_HOURS = Array.from({ length: 12 }, (_, i) => {
  const startHour = 7 + i;
  const endHour = startHour + 1;
  const start = `${String(startHour).padStart(2, "0")}:00`;
  const end = `${String(endHour).padStart(2, "0")}:00`;
  return { start, end, label: start };
});

export function cellKey(dayIndex: number, start: string): string {
  return `${dayIndex}|${normalizeTime(start)}`;
}

export function examCellKey(date: string, start: string): string {
  return `${date}|${normalizeTime(start)}`;
}

export function normalizeTime(t: string): string {
  const [h = "0", m = "00"] = (t || "").split(":");
  const hour = Number.parseInt(h, 10);
  if (Number.isNaN(hour)) return t;
  return `${String(hour).padStart(2, "0")}:${m.slice(0, 2).padStart(2, "0")}`;
}

export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
