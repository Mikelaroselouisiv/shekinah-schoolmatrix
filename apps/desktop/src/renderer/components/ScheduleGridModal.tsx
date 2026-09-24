import { useEffect, useMemo, useState } from "react";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";
import { formatDateJJMMAAAA } from "@/lib/format";
import { useRevealScroll } from "@/lib/useRevealScroll";
import {
  dutyDisplayTitle,
  morningCycleFromLevel,
  namesJoin,
} from "@/lib/morningOpening";
import {
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  addDays,
  cellKey,
  examCellKey,
  examWeeksInRange,
  type ExamWeekBlock,
} from "@/lib/scheduleGrid";

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
  kind: string;
  cycle?: string | null;
  class_id?: string | null;
  class_name?: string | null;
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
  examRangeStart: string;
  examRangeEnd: string;
  onExamRangeStart: (iso: string) => void;
  onExamRangeEnd: (iso: string) => void;
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
  classId?: string | null;
  classLevel?: string | null;
  onCreateMoment?: (payload: {
    kind: string;
    start_time: string;
    end_time: string;
    label: string;
    days: number[];
  }) => void;
  onDeleteMoment?: (id: string) => void;
  momentsBusy?: boolean;
  /** Consultation (horaire renseigné) ou tableau de modification. */
  initialIntent?: "view" | "edit";
};

export function ScheduleGridModal({
  title,
  subtitle,
  mode,
  subjects,
  courseCells,
  examCells,
  examRangeStart,
  examRangeEnd,
  onExamRangeStart,
  onExamRangeEnd,
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
  classId = null,
  classLevel = null,
  onCreateMoment,
  onDeleteMoment,
  momentsBusy = false,
  initialIntent = "view",
}: Props) {
  const [intent, setIntent] = useState<"view" | "edit">(initialIntent);
  const editing = intent === "edit";
  const [momentKind, setMomentKind] = useState("RECESS");
  const [momentStart, setMomentStart] = useState("10:00");
  const [momentEnd, setMomentEnd] = useState("10:15");
  const [momentLabel, setMomentLabel] = useState("");
  const [momentDays, setMomentDays] = useState<number[]>(SCHEDULE_DAYS.map((d) => d.index));
  const panelRef = useRevealScroll<HTMLDivElement>(true, title);

  function toggleMomentDay(day: number) {
    setMomentDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  const recessBands = useMemo(() => {
    const map = new Map<string, { start: string; end: string; label: string }>();
    for (const m of classMoments) {
      if (m.kind !== "RECESS") continue;
      const key = `${m.start_time}|${m.end_time}`;
      if (!map.has(key)) {
        map.set(key, {
          start: m.start_time,
          end: m.end_time,
          label: m.label?.trim() || m.title || "Récréation",
        });
      }
    }
    return [...map.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  }, [classMoments]);

  const courseGridRows = useMemo(() => {
    type Row =
      | { type: "hour"; start: string; end: string }
      | { type: "recess"; start: string; end: string; label: string };
    const rows: Row[] = [];
    let bi = 0;
    for (const hour of SCHEDULE_HOURS) {
      while (bi < recessBands.length && recessBands[bi].start <= hour.start) {
        rows.push({ type: "recess", ...recessBands[bi] });
        bi += 1;
      }
      rows.push({ type: "hour", start: hour.start, end: hour.end });
    }
    while (bi < recessBands.length) {
      rows.push({ type: "recess", ...recessBands[bi] });
      bi += 1;
    }
    return rows;
  }, [recessBands]);

  useEffect(() => {
    setIntent(initialIntent);
  }, [initialIntent, title, mode]);

  const occupiedCourseRows = useMemo(() => {
    return courseGridRows.filter((row) => {
      if (row.type === "recess") {
        return SCHEDULE_DAYS.some((day) =>
          classMoments.some(
            (m) =>
              m.kind === "RECESS" &&
              m.day_of_week === day.index &&
              m.start_time === row.start &&
              m.end_time === row.end,
          ),
        );
      }
      return SCHEDULE_DAYS.some((day) => courseCells[cellKey(day.index, row.start)]?.subject_id);
    });
  }, [courseGridRows, classMoments, courseCells]);

  const examViewRows = useMemo(() => {
    return Object.entries(examCells)
      .filter(([, cell]) => cell.subject_id)
      .map(([key, cell]) => {
        const sep = key.lastIndexOf("|");
        const date = sep >= 0 ? key.slice(0, sep) : "";
        const start = sep >= 0 ? key.slice(sep + 1) : "";
        const hour = SCHEDULE_HOURS.find((h) => h.start === start);
        const subject = subjects.find((s) => s.id === cell.subject_id);
        return {
          key,
          date,
          start,
          end: hour?.end ?? start,
          subject: subject?.name ?? "—",
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }, [examCells, subjects]);

  const examFrom = examRangeStart <= examRangeEnd ? examRangeStart : examRangeEnd;
  const examTo = examRangeStart <= examRangeEnd ? examRangeEnd : examRangeStart;
  const examWeeks = useMemo(
    () => (mode === "examens" ? examWeeksInRange(examFrom, examTo) : []),
    [mode, examFrom, examTo],
  );

  function shiftExamRange(days: number) {
    if (!examFrom || !examTo) return;
    onExamRangeStart(addDays(examFrom, days));
    onExamRangeEnd(addDays(examTo, days));
  }

  function setExamDurationWeeks(weeks: number) {
    const from = examFrom || examRangeStart;
    if (!from) return;
    onExamRangeStart(from);
    onExamRangeEnd(addDays(from, weeks * 7 - 1));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl ring-1 ring-slate-200 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700">
              {editing ? "Modification" : "Consultation"}
              {" · "}
              {mode === "examens" ? "Horaire des examens" : "Horaire des cours"}
            </p>
            <h3 className="truncate text-lg font-bold tracking-tight text-slate-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <button type="button" onClick={() => setIntent("view")} className="app-btn-secondary text-sm py-2">
                Voir l’horaire
              </button>
            ) : (
              <button type="button" onClick={() => setIntent("edit")} className="app-btn-primary text-sm py-2">
                Modifier
              </button>
            )}
            <button type="button" onClick={onClose} className="app-btn-secondary text-sm py-2">
              Fermer
            </button>
          </div>
        </header>

        {mode === "examens" && editing ? (
          <div className="border-b border-slate-200 bg-amber-50/70 px-5 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Période</label>
                <select
                  value={examPeriod}
                  onChange={(e) => onExamPeriod(e.target.value)}
                  className="class-input w-full max-w-[14rem] bg-white"
                >
                  <option value="">Sélectionner</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Du</label>
                <DateInputJJMMAAAA
                  value={examFrom}
                  onChange={(iso) => {
                    onExamRangeStart(iso);
                    if (examTo && iso > examTo) onExamRangeEnd(addDays(iso, 13));
                  }}
                  className="class-input bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Au</label>
                <DateInputJJMMAAAA
                  value={examTo}
                  onChange={(iso) => {
                    onExamRangeEnd(iso);
                    if (examFrom && iso < examFrom) onExamRangeStart(iso);
                  }}
                  min={examFrom || undefined}
                  className="class-input bg-white"
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shiftExamRange(-7)}
                  className="rounded-lg px-2 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                  title="Semaine précédente"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => shiftExamRange(7)}
                  className="rounded-lg px-2 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                  title="Semaine suivante"
                >
                  →
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setExamDurationWeeks(n)}
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-950 ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    {n} sem.
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mx-5 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          {mode === "examens" && !editing ? (
            examViewRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                <p className="font-medium text-slate-700">Aucun examen renseigné</p>
                <button type="button" onClick={() => setIntent("edit")} className="mt-3 app-btn-primary text-sm py-2">
                  Composer l’horaire
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Horaire</th>
                      <th className="px-4 py-2.5">Matière</th>
                      {examPeriod ? <th className="px-4 py-2.5">Période</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {examViewRows.map((row) => (
                      <tr key={row.key} className="border-t border-slate-100">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{formatDateJJMMAAAA(row.date)}</td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {row.start} – {row.end.slice(0, 5)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-900">{row.subject}</td>
                        {examPeriod ? <td className="px-4 py-2.5 text-slate-600">{examPeriod}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : mode === "examens" ? (
            <div className="space-y-6">
              {examWeeks.map((week, wi) => (
                <ExamWeekTable
                  key={week.weekStart}
                  week={week}
                  weekIndex={wi}
                  weekCount={examWeeks.length}
                  subjects={subjects}
                  examCells={examCells}
                  examPeriod={examPeriod}
                  savingKey={savingKey}
                  onSelectExam={onSelectExam}
                />
              ))}
            </div>
          ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[5.5rem] border-b border-r border-slate-200 bg-slate-50 px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Heure
                  </th>
                  {SCHEDULE_DAYS.map((day) => (
                    <th
                      key={day.index}
                      className="min-w-[8.5rem] border-b border-slate-200 bg-slate-50 px-2 py-2.5 text-center font-semibold text-slate-800"
                    >
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!editing && occupiedCourseRows.length === 0 ? (
                  <tr>
                    <td colSpan={1 + SCHEDULE_DAYS.length} className="px-6 py-14 text-center">
                      <p className="font-medium text-slate-700">Aucun créneau renseigné</p>
                      <button type="button" onClick={() => setIntent("edit")} className="mt-3 app-btn-primary text-sm py-2">
                        Composer l’horaire
                      </button>
                    </td>
                  </tr>
                ) : (editing ? courseGridRows : occupiedCourseRows).map((row) => {
                  if (row.type === "recess") {
                    return (
                      <tr key={`recess-${row.start}-${row.end}`} className="bg-amber-50/80">
                        <th className="sticky left-0 z-10 border-r border-amber-100 bg-amber-50 px-2 py-1.5 text-left font-semibold text-amber-900 whitespace-nowrap">
                          {row.start}–{row.end}
                        </th>
                        {SCHEDULE_DAYS.map((day) => {
                          const hit = classMoments.find(
                            (m) =>
                              m.kind === "RECESS" &&
                              m.day_of_week === day.index &&
                              m.start_time === row.start &&
                              m.end_time === row.end,
                          );
                          return (
                            <td key={`${day.index}-${row.start}`} className="p-1 align-middle">
                              {hit ? (
                                <div className="rounded-lg bg-amber-100 px-1.5 py-1.5 text-center text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200">
                                  {row.label}
                                </div>
                              ) : (
                                <div className="h-8" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }
                  const hour = row;
                  return (
                  <tr key={hour.start} className="odd:bg-white even:bg-slate-50/40">
                    <th className="sticky left-0 z-10 border-r border-slate-100 bg-inherit px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">
                      {hour.start}–{hour.end.slice(0, 5)}
                    </th>
                    {SCHEDULE_DAYS.map((day) => {
                      const key = cellKey(day.index, hour.start);
                      const course = courseCells[key];
                      const value = course?.subject_id ?? "";
                      const subjectName = subjects.find((s) => s.id === value)?.name;
                      const busy = savingKey === key;
                      if (!editing) {
                        return (
                          <td key={key} className="p-1 align-top">
                            {value ? (
                              <div className="rounded-lg bg-teal-50 px-1.5 py-1.5 ring-1 ring-teal-200">
                                <div className="text-xs font-semibold text-teal-950">{subjectName}</div>
                                {course?.teacher_name ? (
                                  <div className="mt-0.5 truncate text-[10px] font-medium text-teal-800/80">
                                    {course.teacher_name}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                        );
                      }
                      return (
                        <td key={key} className="p-1 align-top">
                          <select
                            value={value}
                            disabled={busy}
                            onChange={(e) => onSelectCourse(day.index, hour.start, hour.end, e.target.value)}
                            className={`w-full rounded-lg px-1.5 py-1.5 text-xs font-medium ring-1 transition ${
                              value
                                ? "bg-teal-50 text-teal-900 ring-teal-200"
                                : "bg-white text-slate-500 ring-slate-200"
                            }`}
                          >
                            <option value="">—</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          {course?.teacher_name ? (
                            <div className="mt-0.5 truncate px-0.5 text-[10px] font-medium text-teal-800/80">
                              {course.teacher_name}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {mode === "cours" ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {mode === "cours" && schoolDuties.length > 0 ? (
                <section className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                    Début de journée
                  </p>
                  <h4 className="text-sm font-semibold text-amber-950">Cette classe</h4>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SCHEDULE_DAYS.map((day) => {
                      const cycle = morningCycleFromLevel(classLevel);
                      const ofDay = schoolDuties.filter((x) => x.day_of_week === day.index);
                      const flagClass = ofDay.find((x) => x.kind === "FLAG" && x.class_id === classId);
                      const parts: string[] = [];
                      if (flagClass) parts.push("Montée du drapeau");
                      for (const kind of ["ACCUEIL", "FLAG", "ANIMATION", "DEVOTION", "DEFI", "SERVICE", "PRIERE", "RENTREE"]) {
                        const rows = ofDay.filter(
                          (x) =>
                            x.kind === kind &&
                            x.cycle === cycle &&
                            !(kind === "FLAG" && x.class_id),
                        );
                        if (rows.length === 0) continue;
                        parts.push(
                          `${dutyDisplayTitle(rows[0])} · ${namesJoin(
                            rows.map((r) => r.responsible_name ?? "").filter(Boolean),
                          )}`,
                        );
                      }
                      if (parts.length === 0) return null;
                      return (
                        <span
                          key={day.index}
                          className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-950 ring-1 ring-amber-100"
                        >
                          {day.label} · {parts.join(" · ")}
                        </span>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 shadow-sm lg:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">
                  Cette classe
                </p>
                <h4 className="mb-2 text-sm font-semibold text-teal-950">Moments spéciaux</h4>
                {classMoments.length === 0 ? (
                  <p className="mb-3 text-sm text-teal-800/70">Aucun moment calé.</p>
                ) : (
                  <ul className="mb-3 divide-y divide-teal-100 overflow-hidden rounded-xl bg-white ring-1 ring-teal-100">
                    {classMoments
                      .slice()
                      .sort(
                        (a, b) =>
                          a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
                      )
                      .map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="font-medium text-slate-900">{m.title}</span>
                            <span className="block text-xs text-slate-500">
                              {SCHEDULE_DAYS.find((d) => d.index === m.day_of_week)?.label ?? m.day_of_week}{" "}
                              {m.start_time}–{m.end_time}
                            </span>
                          </span>
                          {editing && onDeleteMoment ? (
                            <button
                              type="button"
                              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              onClick={() => onDeleteMoment(m.id)}
                            >
                              Supprimer
                            </button>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                )}

                {editing && onCreateMoment ? (
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 ring-1 ring-teal-100"
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
                      <label className="mb-1 block text-[11px] font-medium text-slate-600">Type</label>
                      <select
                        value={momentKind}
                        onChange={(e) => setMomentKind(e.target.value)}
                        className="class-input max-w-[12rem] bg-white"
                      >
                        {MOMENT_KINDS.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-600">Libellé</label>
                      <input
                        type="text"
                        value={momentLabel}
                        onChange={(e) => setMomentLabel(e.target.value)}
                        placeholder="Optionnel"
                        className="class-input class-input-name"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-600">Début</label>
                      <input
                        type="time"
                        value={momentStart}
                        onChange={(e) => setMomentStart(e.target.value)}
                        className="class-input w-[7.5rem]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-600">Fin</label>
                      <input
                        type="time"
                        value={momentEnd}
                        onChange={(e) => setMomentEnd(e.target.value)}
                        className="class-input w-[7.5rem]"
                      />
                    </div>
                    <div className="w-full">
                      <div className="mb-1 text-[11px] font-medium text-slate-600">Jours</div>
                      <div className="flex flex-wrap gap-1.5">
                        {SCHEDULE_DAYS.map((day) => {
                          const on = momentDays.includes(day.index);
                          return (
                            <label
                              key={day.index}
                              className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                                on
                                  ? "bg-teal-600 text-white ring-teal-600"
                                  : "bg-white text-slate-600 ring-slate-200"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={on}
                                onChange={() => toggleMomentDay(day.index)}
                              />
                              {day.label.slice(0, 3)}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={momentsBusy || momentDays.length === 0}
                      className="app-btn-primary text-sm py-2 disabled:opacity-60"
                    >
                      {momentsBusy ? "…" : "Caler"}
                    </button>
                  </form>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExamWeekTable({
  week,
  weekIndex,
  weekCount,
  subjects,
  examCells,
  examPeriod,
  savingKey,
  onSelectExam,
}: {
  week: ExamWeekBlock;
  weekIndex: number;
  weekCount: number;
  subjects: Subject[];
  examCells: Record<string, ExamCell>;
  examPeriod: string;
  savingKey: string | null;
  onSelectExam: (date: string, start: string, end: string, subjectId: string) => void;
}) {
  const inRangeDays = week.days.filter((d) => d.inRange);
  const first = inRangeDays[0]?.date;
  const last = inRangeDays[inRangeDays.length - 1]?.date;

  return (
    <div>
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-slate-800">
          Semaine {weekIndex + 1}
          {weekCount > 1 ? ` / ${weekCount}` : ""}
          {first ? (
            <span className="ml-2 font-normal text-slate-500">
              {formatDateJJMMAAAA(first)}
              {last && last !== first ? ` – ${formatDateJJMMAAAA(last)}` : ""}
            </span>
          ) : null}
        </h4>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[5.5rem] border-b border-r border-slate-200 bg-slate-50 px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Heure
              </th>
              {week.days.map((day) => (
                <th
                  key={day.date}
                  className={`min-w-[8.5rem] border-b border-slate-200 px-2 py-2.5 text-center font-semibold ${
                    day.inRange ? "bg-slate-50 text-slate-800" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <div>{day.label}</div>
                  <div className={`mt-0.5 font-normal text-[11px] ${day.inRange ? "text-slate-400" : "text-slate-300"}`}>
                    {formatDateJJMMAAAA(day.date)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCHEDULE_HOURS.map((hour) => (
              <tr key={hour.start} className="odd:bg-white even:bg-slate-50/40">
                <th className="sticky left-0 z-10 border-r border-slate-100 bg-inherit px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">
                  {hour.start}–{hour.end.slice(0, 5)}
                </th>
                {week.days.map((day) => {
                  if (!day.inRange) {
                    return <td key={day.date} className="bg-slate-50/80 p-1" />;
                  }
                  const key = examCellKey(day.date, hour.start);
                  const exam = examCells[key];
                  const value = exam?.subject_id ?? "";
                  const busy = savingKey === key;
                  return (
                    <td key={key} className="p-1 align-top">
                      <select
                        value={value}
                        disabled={busy || !examPeriod}
                        onChange={(e) => onSelectExam(day.date, hour.start, hour.end, e.target.value)}
                        className={`w-full rounded-lg px-1.5 py-1.5 text-xs font-medium ring-1 transition ${
                          value
                            ? "bg-amber-50 text-amber-950 ring-amber-200"
                            : "bg-white text-slate-500 ring-slate-200"
                        }`}
                      >
                        <option value="">—</option>
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
