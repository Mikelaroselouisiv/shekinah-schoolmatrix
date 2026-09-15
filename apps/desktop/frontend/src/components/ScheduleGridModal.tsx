"use client";

import { useState } from "react";
import { DateInputJJMMAAAA } from "@/src/components/DateInputJJMMAAAA";
import { formatDateJJMMAAAA } from "@/src/lib/format";
import {
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  addDays,
  cellKey,
  examCellKey,
  mondayOf,
} from "@/src/lib/scheduleGrid";

type Subject = { id: string; name: string };
type Period = { id: string; name: string };
type CourseCell = { id: string; subject_id: string; teacher_name?: string | null };
type ExamCell = { id: string; subject_id: string };

export type ClassScheduleMoment = {
  id: string;
  class_id: string;
  kind: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string | null;
};

export type SchoolScheduleDuty = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  responsible_name: string | null;
};

const MOMENT_KINDS = [
  { id: "ENTRY", label: "Rentrée" },
  { id: "RECESS", label: "Récréation" },
  { id: "CLOSING", label: "Prière de fin de journée" },
] as const;

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
  classMoments?: ClassScheduleMoment[];
  schoolDuties?: SchoolScheduleDuty[];
  onCreateMoment?: (payload: {
    kind: string;
    start_time: string;
    end_time: string;
    label: string;
    days: number[];
  }) => void;
  onDeleteMoment?: (id: string) => void;
  momentsBusy?: boolean;
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
  classMoments = [],
  schoolDuties = [],
  onCreateMoment,
  onDeleteMoment,
  momentsBusy = false,
}: Props) {
  const weekStart = mondayOf(examWeekStart || "");
  const [momentKind, setMomentKind] = useState("RECESS");
  const [momentStart, setMomentStart] = useState("10:00");
  const [momentEnd, setMomentEnd] = useState("10:15");
  const [momentLabel, setMomentLabel] = useState("");
  const [momentDays, setMomentDays] = useState<number[]>(SCHEDULE_DAYS.map((d) => d.index));

  function toggleMomentDay(day: number) {
    setMomentDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

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

          {mode === "cours" && (
            <div className="mt-6 space-y-4 border-t border-[var(--app-border)] pt-5">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Moments spéciaux de la classe</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Rentrée, récréation et prière de fin : durées courtes (pas une heure de cours).
                  Elles se calent sur cette classe uniquement.
                </p>
              </div>

              {schoolDuties.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
                  <div className="font-medium">Dévotion (toute l’école)</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {SCHEDULE_DAYS.map((day) => {
                      const d = schoolDuties.find((x) => x.day_of_week === day.index);
                      if (!d) return null;
                      return (
                        <span key={day.index}>
                          {day.label} {d.start_time}–{d.end_time}
                          {d.responsible_name ? ` · ${d.responsible_name}` : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {classMoments.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun moment spécial pour cette classe.</p>
              ) : (
                <ul className="divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]">
                  {classMoments
                    .slice()
                    .sort(
                      (a, b) =>
                        a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
                    )
                    .map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium text-slate-900">{m.title}</span>
                          <span className="text-slate-500">
                            {" "}
                            · {SCHEDULE_DAYS.find((d) => d.index === m.day_of_week)?.label ?? m.day_of_week}{" "}
                            {m.start_time}–{m.end_time}
                          </span>
                        </span>
                        {onDeleteMoment && (
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => onDeleteMoment(m.id)}
                          >
                            Supprimer
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              )}

              {onCreateMoment && (
                <form
                  className="grid gap-3 rounded-lg border border-[var(--app-border)] bg-slate-50 p-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!momentDays.length) return;
                    onCreateMoment({
                      kind: momentKind,
                      start_time: momentStart,
                      end_time: momentEnd,
                      label: momentLabel,
                      days: momentDays,
                    });
                  }}
                >
                  <div>
                    <label className="mb-0.5 block text-xs text-slate-500">Type</label>
                    <select
                      value={momentKind}
                      onChange={(e) => setMomentKind(e.target.value)}
                      className="w-full rounded border border-[var(--app-border)] bg-white px-2 py-1.5 text-sm"
                    >
                      {MOMENT_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>{k.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-slate-500">Libellé (optionnel)</label>
                    <input
                      type="text"
                      value={momentLabel}
                      onChange={(e) => setMomentLabel(e.target.value)}
                      placeholder="Grande récré…"
                      className="w-full rounded border border-[var(--app-border)] bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-slate-500">Début</label>
                    <input
                      type="time"
                      value={momentStart}
                      onChange={(e) => setMomentStart(e.target.value)}
                      className="w-full rounded border border-[var(--app-border)] bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-slate-500">Fin</label>
                    <input
                      type="time"
                      value={momentEnd}
                      onChange={(e) => setMomentEnd(e.target.value)}
                      className="w-full rounded border border-[var(--app-border)] bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-xs text-slate-500">Jours</div>
                    <div className="flex flex-wrap gap-3">
                      {SCHEDULE_DAYS.map((day) => (
                        <label key={day.index} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={momentDays.includes(day.index)}
                            onChange={() => toggleMomentDay(day.index)}
                          />
                          {day.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={momentsBusy || momentDays.length === 0}
                      className="app-btn-primary text-sm py-1.5 disabled:opacity-60"
                    >
                      {momentsBusy ? "Enregistrement…" : "Caler sur l’horaire"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
