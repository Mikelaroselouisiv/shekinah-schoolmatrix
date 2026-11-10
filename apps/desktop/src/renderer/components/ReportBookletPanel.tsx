import { useEffect, useMemo, useState } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { periodScopeFromLevel } from "@/lib/educationLevels";
import {
  PRESCHOOL_FREQUENCIES,
  PRESCHOOL_LEVELS,
  preschoolFrequencyLabel,
  preschoolLevelLabel,
  YEAR_END_DECISIONS,
} from "@/lib/preschoolScale";
import {
  buildBulletinSheetsPdf,
  composePreschoolSheets,
  composeSchoolSheets,
  type PreschoolResults,
  type SchoolResults,
} from "@/lib/bulletinSheetPdf";
import { getImageUrl, useSchoolProfileOptional } from "@/context/SchoolProfileContext";

type ClassItem = { id: string; name: string; is_preschool?: boolean; level?: string | null };
type YearItem = { id: string; name: string };
type RoomItem = { id: string; name: string; class_id?: string | null; active?: boolean };
type PeriodItem = { id: string; name: string; scope?: string; order_index?: number };
type SubjectItem = { id: string; name: string };
type StudentItem = {
  id: string;
  first_name: string;
  last_name: string;
  room_id?: string | null;
  room_name?: string | null;
  decision?: string | null;
  average?: number | null;
};
type DocKind = "bulletin" | "carnet";

const DECISION_LABELS = Object.fromEntries(YEAR_END_DECISIONS.map((d) => [d.value, d.label]));

function decisionLabel(value?: string | null): string {
  if (!value) return "";
  return DECISION_LABELS[value] ?? value;
}

function preschoolMark(cell?: { level?: string; frequency?: string; observation?: string }): string {
  if (!cell) return "";
  const levelLabel = cell.level ? preschoolLevelLabel(cell.level) : "";
  const freqLabel = cell.frequency ? preschoolFrequencyLabel(cell.frequency) : "";
  const level = PRESCHOOL_LEVELS.find((x) => x.label === levelLabel)?.abbr ?? "";
  const freq = PRESCHOOL_FREQUENCIES.find((x) => x.label === freqLabel)?.abbr ?? "";
  const bits = [level, freq].filter(Boolean);
  if (bits.length) return bits.join(" ");
  return cell.observation?.trim() || "";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function ReportBookletPanel({ classes }: { classes: ClassItem[] }) {
  const school = useSchoolProfileOptional()?.school ?? null;
  const [years, setYears] = useState<YearItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [kind, setKind] = useState<DocKind>("bulletin");
  const [periodId, setPeriodId] = useState("");
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const selectedClass = classes.find((c) => c.id === classId);
  const classRooms = rooms.filter((r) => r.class_id === classId && r.active !== false);
  const visibleStudents = useMemo(
    () => (roomId ? students.filter((s) => s.room_id === roomId) : students),
    [students, roomId],
  );
  const shownPeriods = useMemo(() => {
    if (kind === "bulletin") return periods.filter((p) => p.id === periodId);
    return periods;
  }, [kind, periods, periodId]);
  const ready =
    !!yearId &&
    !!classId &&
    subjectIds.length > 0 &&
    studentIds.length > 0 &&
    shownPeriods.length > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [yearsRes, roomsRes, ctxRes] = await Promise.all([
          fetchWithAuth(`${API_BASE}/academic-years`),
          fetchWithAuth(`${API_BASE}/rooms`),
          fetchWithAuth(`${API_BASE}/school/current-context`),
        ]);
        const yearsData = await yearsRes.json();
        const roomsData = await roomsRes.json();
        const ctxData = await ctxRes.json();
        if (cancelled) return;
        if (yearsRes.ok) {
          const list: YearItem[] = yearsData.academic_years ?? [];
          setYears(list);
          const preferred = ctxRes.ok ? ctxData.current_academic_year_id : "";
          setYearId((prev) => prev || (list.some((y) => y.id === preferred) ? preferred : list[0]?.id || ""));
        }
        if (roomsRes.ok) setRooms(roomsData.rooms ?? []);
      } catch {
        /* le bloc reste utilisable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!yearId || !selectedClass) {
      setPeriods([]);
      setPeriodId("");
      return;
    }
    let cancelled = false;
    const scope = selectedClass.is_preschool ? "PRESCOLAIRE" : periodScopeFromLevel(selectedClass.level);
    fetchWithAuth(`${API_BASE}/periods?academic_year_id=${yearId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list: PeriodItem[] = (data.periods ?? [])
          .filter((p: PeriodItem) => (p.scope || "ECOLE") === scope)
          .sort((a: PeriodItem, b: PeriodItem) => (a.order_index ?? 0) - (b.order_index ?? 0));
        setPeriods(list);
        setPeriodId((prev) => (list.some((p) => p.id === prev) ? prev : list[0]?.id || ""));
      })
      .catch(() => {
        if (!cancelled) setPeriods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [yearId, selectedClass?.id, selectedClass?.level, selectedClass?.is_preschool]);

  useEffect(() => {
    setRoomId("");
    if (!classId) {
      setSubjects([]);
      setSubjectIds([]);
      return;
    }
    let cancelled = false;
    fetchWithAuth(`${API_BASE}/classes/${classId}/subjects`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list: SubjectItem[] = (data.subjects ?? []).map((s: SubjectItem) => ({ id: s.id, name: s.name }));
        setSubjects(list);
        setSubjectIds(list.map((s) => s.id));
      })
      .catch(() => {
        if (!cancelled) {
          setSubjects([]);
          setSubjectIds([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useEffect(() => {
    if (!yearId || !classId) {
      setStudents([]);
      setStudentIds([]);
      return;
    }
    let cancelled = false;
    fetchWithAuth(`${API_BASE}/formation-classe/students?academic_year_id=${yearId}&class_id=${classId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list: StudentItem[] = (data.students ?? []).filter((s: StudentItem) => s.id);
        setStudents(list);
        setStudentIds(list.map((s) => s.id));
      })
      .catch(() => {
        if (!cancelled) {
          setStudents([]);
          setStudentIds([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [yearId, classId]);

  useEffect(() => {
    const ids = visibleStudents.map((s) => s.id);
    setStudentIds(ids);
  }, [roomId, visibleStudents]);

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function buildPdf(): Promise<Blob> {
    if (!ready || !selectedClass) throw new Error("Choix incomplet");
    setError("");
    const yearName = years.find((y) => y.id === yearId)?.name ?? "";
    const roomName = classRooms.find((r) => r.id === roomId)?.name;
    const cohort = (roomId ? visibleStudents : students).map((student) =>
      roomName && !student.room_name ? { ...student, room_name: roomName } : student,
    );
    const picked = new Set(studentIds);
    const subjectList = subjects.filter((s) => subjectIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name }));
    const preschool = !!selectedClass.is_preschool;
    const results = new Map<string, SchoolResults & PreschoolResults>();
    const queue = [...cohort];
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        const student = queue.shift();
        if (!student) return;
        const url = preschool
          ? `${API_BASE}/grades/preschool/student-results?student_id=${student.id}&academic_year_id=${yearId}`
          : `${API_BASE}/grades/student-exam-results?student_id=${student.id}&academic_year_id=${yearId}`;
        const res = await fetchWithAuth(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
        results.set(student.id, data);
      }
    });
    await Promise.all(workers);
    const subtitle = [
      preschool ? "Préscolaire" : "",
      kind === "bulletin" ? shownPeriods[0]?.name ?? "" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const schoolInfo = school
      ? {
          name: school.name,
          email: school.email,
          phone: school.phone,
          address: school.address,
          logo_url: getImageUrl(school.logo_url) ?? school.logo_url,
        }
      : null;
    const pages = preschool
      ? composePreschoolSheets({
          className: selectedClass.name,
          students: cohort,
          pickedIds: [...picked],
          periods: shownPeriods,
          subjects: subjectList,
          results,
          mark: preschoolMark,
          decisionLabel,
        }).map((sheet) => ({ type: "preschool" as const, sheet }))
      : composeSchoolSheets({
          className: selectedClass.name,
          students: cohort,
          pickedIds: [...picked],
          periods: shownPeriods,
          subjects: subjectList,
          results,
          decisionLabel,
        }).map((sheet) => ({ type: "school" as const, sheet }));
    return buildBulletinSheetsPdf({ school: schoolInfo, yearName, subtitle, pages });
  }

  const filenamePlace = slugify(classRooms.find((r) => r.id === roomId)?.name || selectedClass?.name || "classe");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
        {([
          ["bulletin", "Bulletin"],
          ["carnet", "Carnet"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              kind === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1.5">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Année</span>
          <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="class-input w-full bg-white">
            <option value="">Sélectionner</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Classe</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="class-input w-full bg-white">
            <option value="">Sélectionner</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.is_preschool ? " (préscolaire)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Salle</span>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="class-input w-full bg-white"
            disabled={!classId}
          >
            <option value="">{classId ? "Toutes les salles" : "Choisissez une classe"}</option>
            {classRooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        {kind === "bulletin" ? (
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Période</span>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="class-input w-full bg-white" disabled={!classId}>
              <option value="">Sélectionner</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="self-end pb-2 text-sm text-slate-600">
            {periods.length ? `${periods.length} période${periods.length > 1 ? "s" : ""} de l'année` : "Aucune période"}
          </p>
        )}
      </div>

      {classId ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Matières</span>
            {subjects.length > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-teal-800"
                onClick={() => setSubjectIds(subjectIds.length === subjects.length ? [] : subjects.map((s) => s.id))}
              >
                {subjectIds.length === subjects.length ? "Aucune" : "Toutes"}
              </button>
            ) : null}
          </div>
          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune matière dans cette classe.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {subjects.map((s) => {
                const on = subjectIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                      on ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-200"
                    }`}
                  >
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setSubjectIds((ids) => toggleId(ids, s.id))} />
                    {s.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {classId && yearId ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Élèves · {studentIds.length} sélectionné{studentIds.length > 1 ? "s" : ""}
            </span>
            {visibleStudents.length > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-teal-800"
                onClick={() =>
                  setStudentIds(studentIds.length === visibleStudents.length ? [] : visibleStudents.map((s) => s.id))
                }
              >
                {studentIds.length === visibleStudents.length ? "Aucun" : roomId ? "Toute la salle" : "Toute la classe"}
              </button>
            ) : null}
          </div>
          {visibleStudents.length === 0 ? (
            <p className="text-sm text-slate-500">
              {roomId ? "Aucun élève dans cette salle." : "Aucun élève dans cette classe pour cette année."}
            </p>
          ) : (
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
              {visibleStudents.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                  <input
                    type="checkbox"
                    checked={studentIds.includes(s.id)}
                    onChange={() => setStudentIds((ids) => toggleId(ids, s.id))}
                  />
                  <span className="font-medium text-slate-900">{s.last_name} {s.first_name}</span>
                  {!roomId && s.room_name ? <span className="text-slate-500">{s.room_name}</span> : null}
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ExportPdfButton
        label={kind === "bulletin" ? `Préparer les bulletins (${studentIds.length})` : `Préparer les carnets (${studentIds.length})`}
        filename={`${kind === "bulletin" ? "bulletins" : "carnets"}-${filenamePlace}`}
        disabled={!ready}
        getBlob={async () => {
          try {
            return await buildPdf();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur");
            throw e;
          }
        }}
      />
    </div>
  );
}
