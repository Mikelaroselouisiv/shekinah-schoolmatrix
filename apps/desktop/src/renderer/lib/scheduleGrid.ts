/** Jours affichés dans la grille horaire (lundi → vendredi). */
export const SCHEDULE_DAYS = [
  { index: 1, label: "Lundi" },
  { index: 2, label: "Mardi" },
  { index: 3, label: "Mercredi" },
  { index: 4, label: "Jeudi" },
  { index: 5, label: "Vendredi" },
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

/** Nombre max de semaines affichées dans la grille d’examens. */
export const MAX_EXAM_WEEKS = 10;

export type ExamWeekDay = {
  index: number;
  label: string;
  date: string;
  inRange: boolean;
};

export type ExamWeekBlock = {
  weekStart: string;
  days: ExamWeekDay[];
};

/** Normalise une plage (début ≤ fin) sans forcer le lundi. */
export function orderedDateRange(start: string, end: string): { start: string; end: string } {
  if (!start && !end) return { start: "", end: "" };
  if (!start) return { start: end, end };
  if (!end) return { start, end: start };
  return start <= end ? { start, end } : { start: end, end: start };
}

/** Semaines lundi–vendredi qui recoupent la plage. Les jours hors plage restent visibles mais inactifs. */
export function examWeeksInRange(startIso: string, endIso: string, maxWeeks = MAX_EXAM_WEEKS): ExamWeekBlock[] {
  const { start, end } = orderedDateRange(startIso, endIso);
  if (!start || !end) return [];
  const weeks: ExamWeekBlock[] = [];
  let cursor = mondayOf(start);
  const lastMonday = mondayOf(end);
  let guard = 0;
  while (cursor <= lastMonday && guard < maxWeeks) {
    weeks.push({
      weekStart: cursor,
      days: SCHEDULE_DAYS.map((day, i) => {
        const date = addDays(cursor, i);
        return {
          index: day.index,
          label: day.label,
          date,
          inRange: date >= start && date <= end,
        };
      }),
    });
    cursor = addDays(cursor, 7);
    guard += 1;
  }
  return weeks;
}

export function defaultExamRange(): { start: string; end: string } {
  const start = mondayOf(todayIso());
  return { start, end: addDays(start, 11) };
}
