import { useEffect, useMemo, useState } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { formatPointsOnBareme, pointsToTen } from "@/lib/gradeScale";
import { periodScopeFromLevel } from "@/lib/educationLevels";
import { preschoolFrequencyLabel, preschoolLevelLabel, YEAR_END_DECISIONS } from "@/lib/preschoolScale";
import { getSectionsPdfBlob, type PdfSection } from "@/lib/pdfExport";
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

type SchoolSubjectPeriod = {
  period_id: string;
  coefficient?: number;
  grade_value?: number | null;
  has_grade?: boolean;
};
type SchoolResults = {
  subjects?: { subject_id: string; subject_name: string; periods?: SchoolSubjectPeriod[] }[];
};
type PreschoolResults = {
  cells?: Record<string, { level?: string; frequency?: string; observation?: string }>;
};

const DECISION_LABELS = Object.fromEntries(YEAR_END_DECISIONS.map((d) => [d.value, d.label]));

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function preschoolCell(cell?: { level?: string; frequency?: string; observation?: string }): string {
  if (!cell) return "—";
  const parts = [
    cell.level ? preschoolLevelLabel(cell.level) : "",
    cell.frequency ? preschoolFrequencyLabel(cell.frequency) : "",
    cell.observation?.trim() || "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function schoolNote(grade?: SchoolSubjectPeriod): string {
  if (!grade?.has_grade || grade.grade_value == null) return "—";
  return formatPointsOnBareme(Number(grade.grade_value), Number(grade.coefficient));
}

function schoolAverage(grades: SchoolSubjectPeriod[], periodIds: string[]): string {
  const scored = grades.filter((g) => periodIds.includes(g.period_id) && g.has_grade && g.grade_value != null);
  const points = scored.reduce((s, g) => s + Number(g.grade_value || 0), 0);
  const coef = scored.reduce((s, g) => s + Number(g.coefficient || 0), 0);
  const ten = pointsToTen(points, coef);
  return ten == null ? "—" : ten.toFixed(2);
}

function identityLines(student: StudentItem, className: string, yearName: string, extra: string[]): string[] {
  const room = student.room_name ? `Salle : ${student.room_name}` : "";
  return [
    `${student.last_name} ${student.first_name}`,
    [`Classe : ${className}`, room, yearName ? `Année : ${yearName}` : ""].filter(Boolean).join("   ·   "),
    ...extra,
  ];
}

function schoolSection(
  student: StudentItem,
  className: string,
  yearName: string,
  results: SchoolResults,
  periods: PeriodItem[],
  subjectIds: string[],
  subjectNames: Map<string, string>,
  kind: DocKind,
  startNewPage: boolean,
): PdfSection {
  const byId = new Map((results.subjects ?? []).map((s) => [s.subject_id, s]));
  const periodIds = periods.map((p) => p.id);
  const columns = [
    { header: "Matière", key: "matiere" },
    ...periods.map((p, i) => ({ header: p.name, key: `p${i}` })),
    ...(kind === "carnet" ? [{ header: "Moy. /10", key: "moy" }] : []),
  ];
  const rows = subjectIds.map((id) => {
    const subj = byId.get(id);
    const grades = subj?.periods ?? [];
    const row: Record<string, string> = { matiere: subjectNames.get(id) ?? subj?.subject_name ?? "—" };
    periods.forEach((p, i) => {
      row[`p${i}`] = schoolNote(grades.find((g) => g.period_id === p.id));
    });
    if (kind === "carnet") row.moy = schoolAverage(grades, periodIds);
    return row;
  });
  const extra =
    kind === "carnet"
      ? [
          ...(student.average != null ? [`Moyenne générale /10 : ${Number(student.average).toFixed(2)}`] : []),
          ...(student.decision ? [`Décision : ${DECISION_LABELS[student.decision] ?? student.decision}`] : []),
        ]
      : [];
  return {
    breakBefore: startNewPage,
    title: kind === "bulletin" ? `Bulletin — ${periods[0]?.name ?? ""}` : undefined,
    lines: identityLines(student, className, yearName, extra),
    table: rows.length ? { columns, rows } : undefined,
  };
}

function preschoolSection(
  student: StudentItem,
  className: string,
  yearName: string,
  results: PreschoolResults,
  periods: PeriodItem[],
  subjectIds: string[],
  subjectNames: Map<string, string>,
  kind: DocKind,
  startNewPage: boolean,
): PdfSection {
  const columns = [
    { header: "Matière", key: "matiere" },
    ...periods.map((p, i) => ({ header: p.name, key: `p${i}` })),
  ];
  const rows = subjectIds.map((id) => {
    const row: Record<string, string> = { matiere: subjectNames.get(id) ?? "—" };
    periods.forEach((p, i) => {
      row[`p${i}`] = preschoolCell(results.cells?.[`${id}:${p.id}`]);
    });
    return row;
  });
  const extra =
    kind === "carnet" && student.decision
      ? [`Décision : ${DECISION_LABELS[student.decision] ?? student.decision}`]
      : [];
  return {
    breakBefore: startNewPage,
    title: kind === "bulletin" ? `Bulletin — ${periods[0]?.name ?? ""}` : undefined,
    lines: identityLines(student, className, yearName, extra),
    table: rows.length ? { columns, rows } : undefined,
  };
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
    const names = new Map(subjects.map((s) => [s.id, s.name]));
    const yearName = years.find((y) => y.id === yearId)?.name ?? "";
    const roomName = classRooms.find((r) => r.id === roomId)?.name;
    const picked = visibleStudents.filter((s) => studentIds.includes(s.id));
    const sections: PdfSection[] = [];
    const preschool = !!selectedClass.is_preschool;
    for (let i = 0; i < picked.length; i++) {
      const student = picked[i];
      const url = preschool
        ? `${API_BASE}/grades/preschool/student-results?student_id=${student.id}&academic_year_id=${yearId}`
        : `${API_BASE}/grades/student-exam-results?student_id=${student.id}&academic_year_id=${yearId}`;
      const res = await fetchWithAuth(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const withRoom = roomName && !student.room_name ? { ...student, room_name: roomName } : student;
      sections.push(
        preschool
          ? preschoolSection(withRoom, selectedClass.name, yearName, data, shownPeriods, subjectIds, names, kind, i > 0)
          : schoolSection(withRoom, selectedClass.name, yearName, data, shownPeriods, subjectIds, names, kind, i > 0),
      );
    }
    return getSectionsPdfBlob(sections, undefined, {
      orientation: kind === "carnet" ? "landscape" : "portrait",
      format: "letter",
      headerEachPage: kind === "bulletin",
      tableFontSize: kind === "carnet" ? 8 : 9,
      tableCellPadding: kind === "carnet" ? 1.5 : 2,
      school:
        kind === "bulletin" && school
          ? {
              name: school.name,
              email: school.email,
              phone: school.phone,
              address: school.address,
              logo_url: getImageUrl(school.logo_url) ?? school.logo_url,
            }
          : undefined,
    });
  }

  const filenamePlace = slugify(classRooms.find((r) => r.id === roomId)?.name || selectedClass?.name || "classe");

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Un bulletin couvre une période, avec l'en-tête de l'école sur la page de chaque élève. Un carnet reprend toutes les périodes de l'année, en grille paysage, sans en-tête : c'est le verso à imprimer.
      </p>
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
