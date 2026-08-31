import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";
import { formatDateJJMMAAAA } from "@/lib/format";
import {
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  addDays,
  cellKey,
  examCellKey,
  mondayOf,
} from "@/lib/scheduleGrid";

type Subject = { id: string; name: string };
type Period = { id: string; name: string };
type CourseCell = { id: string; subject_id: string; teacher_name?: string | null };
type ExamCell = { id: string; subject_id: string };

type Props = {
  title: string;
  subtitle?: string;
  mode: "cours" | "examens";
  subjects: Subject[];
  courseCells: Record<string, CourseCell>;
  examCells: Record<string, ExamCell>;
  examWeekStart: string;
  onExamWeekStart: (iso: string) => void;
  examPeriod: string;
  onExamPeriod: (name: string) => void;
  periods: Period[];
  savingKey: string | null;
  error?: string;
  onClose: () => void;
  onSelectCourse: (dayIndex: number, start: string, end: string, subjectId: string) => void;
  onSelectExam: (date: string, start: string, end: string, subjectId: string) => void;
};

export function ScheduleGridModal({
  title,
  subtitle,
  mode,
  subjects,
  courseCells,
  examCells,
  examWeekStart,
  onExamWeekStart,
  examPeriod,
  onExamPeriod,
  periods,
  savingKey,
  error,
  onClose,
  onSelectCourse,
  onSelectExam,
}: Props) {
  const weekStart = mondayOf(examWeekStart || "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="app-btn-secondary text-sm py-1.5">
            Fermer
          </button>
        </div>

        {mode === "examens" && (
          <div className="flex flex-wrap gap-4 border-b border-[var(--app-border)] bg-slate-50 px-5 py-3">
            <div>
              <label className="mb-0.5 block text-xs text-slate-500">Période *</label>
              <select
                value={examPeriod}
                onChange={(e) => onExamPeriod(e.target.value)}
                className="rounded border border-[var(--app-border)] bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Sélectionner</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-slate-500">Semaine du (lundi)</label>
              <DateInputJJMMAAAA
                value={weekStart}
                onChange={(iso) => onExamWeekStart(mondayOf(iso))}
                className="rounded border border-[var(--app-border)] bg-white px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}

        {error && <div className="mx-5 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <p className="px-5 pt-3 text-xs text-slate-500">
          Choisissez la matière dans chaque case. Le professeur est celui déjà assigné à cette salle.
          Laissez vide pour libérer le créneau.
        </p>

        <div className="flex-1 overflow-auto p-5 pt-3">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[88px] border border-[var(--app-border)] bg-slate-50 px-2 py-2 text-left font-medium text-slate-700">
                  Heure
                </th>
                {SCHEDULE_DAYS.map((day, i) => {
                  const date = mode === "examens" ? addDays(weekStart, i) : null;
                  return (
                    <th
                      key={day.index}
                      className="min-w-[140px] border border-[var(--app-border)] bg-slate-50 px-2 py-2 text-center font-medium text-slate-800"
                    >
                      <div>{day.label}</div>
                      {date && (
                        <div className="font-normal text-slate-500">{formatDateJJMMAAAA(date)}</div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_HOURS.map((hour) => (
                <tr key={hour.start}>
                  <th className="sticky left-0 z-10 border border-[var(--app-border)] bg-white px-2 py-1.5 text-left font-medium text-slate-600 whitespace-nowrap">
                    {hour.start} – {hour.end}
                  </th>
                  {SCHEDULE_DAYS.map((day, i) => {
                    const date = mode === "examens" ? addDays(weekStart, i) : null;
                    const key =
                      mode === "cours"
                        ? cellKey(day.index, hour.start)
                        : examCellKey(date!, hour.start);
                    const course = courseCells[key];
                    const exam = examCells[key];
                    const value = mode === "cours" ? (course?.subject_id ?? "") : (exam?.subject_id ?? "");
                    const busy = savingKey === key;
                    return (
                      <td key={key} className="border border-[var(--app-border)] p-1 align-top">
                        <select
                          value={value}
                          disabled={busy || (mode === "examens" && !examPeriod)}
                          onChange={(e) => {
                            if (mode === "cours") {
                              onSelectCourse(day.index, hour.start, hour.end, e.target.value);
                            } else if (date) {
                              onSelectExam(date, hour.start, hour.end, e.target.value);
                            }
                          }}
                          className={`w-full rounded border px-1.5 py-1.5 text-xs ${
                            value
                              ? "border-[var(--school-accent-1)]/40 bg-[var(--school-accent-1)]/5"
                              : "border-[var(--app-border)] bg-white"
                          }`}
                        >
                          <option value="">—</option>
                          {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {mode === "cours" && course?.teacher_name && (
                          <div className="mt-0.5 truncate px-0.5 text-[10px] text-slate-500">
                            {course.teacher_name}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
