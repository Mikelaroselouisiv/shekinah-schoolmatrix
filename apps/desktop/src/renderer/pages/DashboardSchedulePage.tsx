import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { formatDateJJMMAAAA } from "@/lib/format";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { ScheduleGridModal } from "@/components/ScheduleGridModal";
import type { PdfColumn, PdfSection } from "@/lib/pdfExport";
import {
  cellKey,
  examCellKey,
  mondayOf,
  todayIso,
} from "@/lib/scheduleGrid";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
/** Semaine de classe : lundi d'abord, dimanche en dernier. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const SLOT_COLUMNS: PdfColumn[] = [
  { header: "Horaire", key: "horaire" },
  { header: "Classe", key: "classe" },
  { header: "Matière", key: "matiere" },
  { header: "Professeur", key: "professeur" },
  { header: "Salle", key: "salle" },
];

const EXAM_COLUMNS: PdfColumn[] = [
  { header: "Date", key: "date" },
  { header: "Horaire", key: "horaire" },
  { header: "Classe", key: "classe" },
  { header: "Matière", key: "matiere" },
  { header: "Période", key: "periode" },
];

const ACTIVITY_COLUMNS: PdfColumn[] = [
  { header: "Date", key: "date" },
  { header: "Horaire", key: "horaire" },
  { header: "Classe", key: "classe" },
  { header: "Occasion", key: "occasion" },
  { header: "Frais", key: "frais" },
  { header: "Tenue", key: "tenue" },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type ScheduleSlot = {
  id: string;
  academic_year: string | null;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  teacher_id: number;
  teacher_name: string | null;
  room_id: string | null;
  room_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type ExamSchedule = {
  id: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  period: string;
  exam_date: string;
  start_time: string;
  end_time: string;
};

type ExtracurricularActivity = {
  id: string;
  academic_year_id: string;
  academic_year_name: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name: string;
  occasion: string;
  participation_fee: string | null;
  dress_code: string | null;
};

type ClassItem = { id: string; name: string };
type Subject = { id: string; name: string };
type Room = { id: string; name: string; class_id?: string | null; active?: boolean };
type AcademicYear = { id: string; name: string };
type Period = { id: string; name: string };
type RoomAssignment = { teacher_id: number; teacher_name: string; subject_id: string };
type RoomAssignment = { teacher_id: number; teacher_name: string; subject_id: string };

export function DashboardSchedulePage() {
  const [tab, setTab] = useState<"cours" | "examens" | "parascolaires">("cours");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [activities, setActivities] = useState<ExtracurricularActivity[]>([]);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);

  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");

  const [defaultYearId, setDefaultYearId] = useState("");
  const [defaultYearName, setDefaultYearName] = useState("");
  const [defaultPeriodId, setDefaultPeriodId] = useState("");
  const [defaultPeriodName, setDefaultPeriodName] = useState("");

  const [gridRoom, setGridRoom] = useState<Room | null>(null);
  const [gridSubjects, setGridSubjects] = useState<Subject[]>([]);
  const [gridAssignments, setGridAssignments] = useState<RoomAssignment[]>([]);
  const [gridError, setGridError] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [examWeekStart, setExamWeekStart] = useState(mondayOf(todayIso()));
  const [examGridPeriod, setExamGridPeriod] = useState("");

  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityForm, setActivityForm] = useState({
    academic_year_id: "",
    activity_date: "",
    start_time: "14:00",
    end_time: "16:00",
    class_ids: [] as string[],
    occasion: "",
    participation_fee: "",
    dress_code: "",
  });

  const [saving, setSaving] = useState(false);

  async function loadRefs() {
    try {
      const [cRes, rRes, ayRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/rooms`),
        fetchWithAuth(`${API_BASE}/academic-years`),
      ]);
      const cData = await cRes.json();
      const rData = await rRes.json();
      const ayData = await ayRes.json();
      if (!cRes.ok) throw new Error(cData.message || "Erreur classes");
      if (!rRes.ok) throw new Error(rData.message || "Erreur salles");
      if (!ayRes.ok) throw new Error(ayData.message || "Erreur années scolaires");
      setClasses(cData.classes ?? []);
      setRooms(rData.rooms ?? []);
      setAcademicYears(ayData.academic_years ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadPeriods(academicYearId: string) {
    if (!academicYearId) {
      setPeriods([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/periods?academic_year_id=${academicYearId}`);
      const data = await res.json();
      setPeriods(data.periods ?? []);
    } catch {
      setPeriods([]);
    }
  }

  async function loadSlots(overrideYearId?: string) {
    setError("");
    try {
      const params = new URLSearchParams();
      const yearId = overrideYearId ?? academicYearFilter;
      const yearName = academicYears.find((ay) => ay.id === yearId)?.name;
      if (yearName) params.set("academic_year", yearName);
      if (classFilter) params.set("class_id", classFilter);
      if (roomFilter) params.set("room_id", roomFilter);
      const res = await fetchWithAuth(`${API_BASE}/schedule-slots?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setSlots(data.schedule_slots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadExams() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (classFilter) params.set("class_id", classFilter);
      const res = await fetchWithAuth(`${API_BASE}/exam-schedules?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setExams(data.exam_schedules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadActivities(overrideYearId?: string) {
    setError("");
    try {
      const params = new URLSearchParams();
      const yearId = overrideYearId ?? academicYearFilter;
      if (yearId) params.set("academic_year_id", yearId);
      if (classFilter) params.set("class_id", classFilter);
      const res = await fetchWithAuth(`${API_BASE}/extracurricular-activities?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setActivities(data.extracurricular_activities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function load() {
    setLoading(true);
    await loadRefs();
    let defaultYearId: string | undefined;
    try {
      const ctxRes = await fetchWithAuth(`${API_BASE}/school/current-context`);
      const ctxData = await ctxRes.json();
      if (ctxRes.ok && ctxData.current_academic_year_id) {
        defaultYearId = ctxData.current_academic_year_id;
        setDefaultYearId(ctxData.current_academic_year_id);
        setDefaultYearName(ctxData.current_academic_year_name ?? "");
        setDefaultPeriodId(ctxData.current_period_id ?? "");
        setDefaultPeriodName(ctxData.current_period_name ?? "");
        setAcademicYearFilter((prev) => (prev === "" ? defaultYearId! : prev));
      }
    } catch {
      /* ignore */
    }
    await Promise.all([loadSlots(defaultYearId), loadExams(), loadActivities(defaultYearId)]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadSlots();
      loadExams();
      loadActivities();
    }
  }, [academicYearFilter, classFilter, roomFilter]);

  useEffect(() => {
    loadPeriods(academicYearFilter || defaultYearId);
  }, [academicYearFilter, defaultYearId]);

  async function openRoomGrid(room: Room) {
    setGridRoom(room);
    setGridError("");
    setGridSubjects([]);
    setGridAssignments([]);
    if (tab === "examens") {
      setExamGridPeriod((prev) => prev || defaultPeriodName);
    }
    if (!room.class_id) return;
    try {
      const [subjRes, assignRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes/${room.class_id}/subjects`),
        fetchWithAuth(`${API_BASE}/teachers/assignments?class_id=${room.class_id}&room_id=${room.id}`),
      ]);
      const subjData = await subjRes.json();
      const assignData = await assignRes.json();
      setGridSubjects(subjData.subjects ?? []);
      setGridAssignments(assignData.assignments ?? []);
    } catch (e) {
      setGridError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleCourseCell(dayIndex: number, start: string, end: string, subjectId: string) {
    if (!gridRoom?.class_id) return;
    const key = cellKey(dayIndex, start);
    const existing = slots.find(
      (s) =>
        s.room_id === gridRoom.id &&
        s.day_of_week === dayIndex &&
        cellKey(s.day_of_week, s.start_time) === key,
    );
    setSavingCell(key);
    setGridError("");
    try {
      const yearName = academicYears.find((ay) => ay.id === academicYearFilter)?.name || defaultYearName;
      if (!subjectId) {
        if (existing) {
          const res = await fetchWithAuth(`${API_BASE}/schedule-slots/${existing.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error((await res.json()).message || "Erreur");
        }
      } else if (existing) {
        const teacherId = gridAssignments.find((a) => a.subject_id === subjectId)?.teacher_id;
        const res = await fetchWithAuth(`${API_BASE}/schedule-slots/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ subject_id: subjectId, teacher_id: teacherId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const teacherId = gridAssignments.find((a) => a.subject_id === subjectId)?.teacher_id;
        const res = await fetchWithAuth(`${API_BASE}/schedule-slots`, {
          method: "POST",
          body: JSON.stringify({
            academic_year: yearName || undefined,
            class_id: gridRoom.class_id,
            subject_id: subjectId,
            teacher_id: teacherId,
            room_id: gridRoom.id,
            day_of_week: dayIndex,
            start_time: start,
            end_time: end,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      await loadSlots();
    } catch (e) {
      setGridError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingCell(null);
    }
  }

  async function handleExamCell(date: string, start: string, end: string, subjectId: string) {
    if (!gridRoom?.class_id) return;
    if (!examGridPeriod) {
      setGridError("Choisissez d’abord une période.");
      return;
    }
    const key = examCellKey(date, start);
    const existing = exams.find(
      (ex) =>
        ex.class_id === gridRoom.class_id &&
        (ex.exam_date || "").slice(0, 10) === date &&
        examCellKey(ex.exam_date, ex.start_time) === key,
    );
    setSavingCell(key);
    setGridError("");
    try {
      if (!subjectId) {
        if (existing) {
          const res = await fetchWithAuth(`${API_BASE}/exam-schedules/${existing.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error((await res.json()).message || "Erreur");
        }
      } else if (existing) {
        const res = await fetchWithAuth(`${API_BASE}/exam-schedules/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ subject_id: subjectId, period: examGridPeriod }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/exam-schedules`, {
          method: "POST",
          body: JSON.stringify({
            class_id: gridRoom.class_id,
            subject_id: subjectId,
            period: examGridPeriod,
            exam_date: date,
            start_time: start,
            end_time: end,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      await loadExams();
    } catch (e) {
      setGridError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingCell(null);
    }
  }

  async function handleAddActivity(e: React.FormEvent) {
    e.preventDefault();
    if (
      !activityForm.academic_year_id ||
      !activityForm.class_ids.length ||
      !activityForm.occasion ||
      !activityForm.activity_date
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/extracurricular-activities`, {
        method: "POST",
        body: JSON.stringify({
          academic_year_id: activityForm.academic_year_id,
          activity_date: activityForm.activity_date,
          start_time: activityForm.start_time,
          end_time: activityForm.end_time,
          class_ids: activityForm.class_ids,
          occasion: activityForm.occasion,
          participation_fee: activityForm.participation_fee || null,
          dress_code: activityForm.dress_code || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setShowActivityForm(false);
      setActivityForm({
        academic_year_id: "",
        activity_date: "",
        start_time: "14:00",
        end_time: "16:00",
        class_ids: [],
        occasion: "",
        participation_fee: "",
        dress_code: "",
      });
      loadActivities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function toggleActivityClass(id: string) {
    setActivityForm((f) => ({
      ...f,
      class_ids: f.class_ids.includes(id)
        ? f.class_ids.filter((x) => x !== id)
        : [...f.class_ids, id],
    }));
  }

  function toggleAllActivityClasses() {
    setActivityForm((f) => ({
      ...f,
      class_ids:
        f.class_ids.length === classes.length ? [] : classes.map((c) => c.id),
    }));
  }

  async function handleDeleteActivity(id: string) {
    if (!confirm("Supprimer cette activité ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/extracurricular-activities/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).message || "Erreur");
      loadActivities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const filterLabels = useMemo(() => {
    const year = academicYears.find((ay) => ay.id === academicYearFilter)?.name;
    const klass = classes.find((c) => c.id === classFilter)?.name;
    const room = rooms.find((r) => r.id === roomFilter)?.name;
    return { year, klass, room };
  }, [academicYearFilter, classFilter, roomFilter, academicYears, classes, rooms]);

  const pdfSubtitle = useMemo(() => {
    const parts = [`Année : ${filterLabels.year ?? "toutes"}`];
    if (filterLabels.klass) parts.push(`Classe : ${filterLabels.klass}`);
    if (filterLabels.room) parts.push(`Salle : ${filterLabels.room}`);
    return parts.join("  ·  ");
  }, [filterLabels]);

  const pdfFileSuffix = useMemo(() => {
    const slug = [filterLabels.year, filterLabels.klass, filterLabels.room]
      .filter((v): v is string => !!v)
      .map(slugify)
      .join("-");
    return slug ? `-${slug}` : "";
  }, [filterLabels]);

  const slotSectionsByDay = useMemo<PdfSection[]>(() => {
    const sections: PdfSection[] = [];
    for (const day of DAY_ORDER) {
      const rows = slots
        .filter((s) => s.day_of_week === day)
        .sort(
          (a, b) =>
            a.start_time.localeCompare(b.start_time) ||
            a.class_name.localeCompare(b.class_name),
        )
        .map((s) => ({
          horaire: `${s.start_time} - ${s.end_time}`,
          classe: s.class_name,
          matiere: s.subject_name,
          professeur: s.teacher_name ?? "—",
          salle: s.room_name ?? "—",
        }));
      if (rows.length === 0) continue;
      sections.push({ title: DAYS[day], table: { columns: SLOT_COLUMNS, rows } });
    }
    return sections;
  }, [slots]);

  const examRows = useMemo(
    () =>
      [...exams]
        .sort(
          (a, b) =>
            a.exam_date.localeCompare(b.exam_date) ||
            a.start_time.localeCompare(b.start_time),
        )
        .map((e) => ({
          date: formatDateJJMMAAAA(e.exam_date),
          horaire: `${e.start_time} - ${e.end_time}`,
          classe: e.class_name,
          matiere: e.subject_name,
          periode: e.period,
        })),
    [exams],
  );

  const activityRows = useMemo(
    () =>
      [...activities]
        .sort(
          (a, b) =>
            a.activity_date.localeCompare(b.activity_date) ||
            a.start_time.localeCompare(b.start_time),
        )
        .map((a) => ({
          date: formatDateJJMMAAAA(a.activity_date),
          horaire: `${a.start_time} - ${a.end_time}`,
          classe: a.class_name,
          occasion: a.occasion,
          frais: a.participation_fee ?? "—",
          tenue: a.dress_code ?? "—",
        })),
    [activities],
  );

  const allSchedulesSections = useMemo<PdfSection[]>(() => {
    const sections: PdfSection[] = [{ lines: [pdfSubtitle] }];
    if (slotSectionsByDay.length > 0) {
      sections.push({ title: "Horaire des cours" }, ...slotSectionsByDay);
    }
    if (examRows.length > 0) {
      sections.push({
        title: "Horaire des examens",
        table: { columns: EXAM_COLUMNS, rows: examRows },
      });
    }
    if (activityRows.length > 0) {
      sections.push({
        title: "Activités parascolaires",
        table: { columns: ACTIVITY_COLUMNS, rows: activityRows },
      });
    }
    return sections;
  }, [pdfSubtitle, slotSectionsByDay, examRows, activityRows]);

  const hasAnySchedule =
    slotSectionsByDay.length > 0 || examRows.length > 0 || activityRows.length > 0;

  const roomsToShow = rooms.filter(
    (r) =>
      r.active !== false &&
      (!classFilter || r.class_id === classFilter) &&
      (!roomFilter || r.id === roomFilter),
  );

  const courseCells = useMemo(() => {
    const map: Record<string, { id: string; subject_id: string; teacher_name?: string | null }> = {};
    if (!gridRoom) return map;
    for (const s of slots) {
      if (s.room_id !== gridRoom.id) continue;
      map[cellKey(s.day_of_week, s.start_time)] = {
        id: s.id,
        subject_id: s.subject_id,
        teacher_name: s.teacher_name,
      };
    }
    return map;
  }, [slots, gridRoom]);

  const examCells = useMemo(() => {
    const map: Record<string, { id: string; subject_id: string }> = {};
    if (!gridRoom?.class_id) return map;
    for (const ex of exams) {
      if (ex.class_id !== gridRoom.class_id) continue;
      const date = (ex.exam_date || "").slice(0, 10);
      map[examCellKey(date, ex.start_time)] = { id: ex.id, subject_id: ex.subject_id };
    }
    return map;
  }, [exams, gridRoom]);

  function roomClassName(room: Room) {
    return classes.find((c) => c.id === room.class_id)?.name ?? "";
  }

  function roomSlotCount(room: Room) {
    return slots.filter((s) => s.room_id === room.id).length;
  }

  function roomExamCount(room: Room) {
    return exams.filter((e) => e.class_id === room.class_id).length;
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900">Horaires</h2>
        <ExportPdfButton
          sections={allSchedulesSections}
          mainTitle="Horaires de l'école"
          filename={`horaires${pdfFileSuffix}`}
          label="Tout exporter en PDF"
          disabled={!hasAnySchedule}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--app-border)]">
        {(["cours", "examens", "parascolaires"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t
                ? "bg-white border border-[var(--app-border)] border-b-0 text-slate-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            {t === "cours" && "Horaire des cours"}
            {t === "examens" && "Horaire des examens"}
            {t === "parascolaires" && "Activités parascolaires"}
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Année</label>
          <select
            value={academicYearFilter}
            onChange={(e) => setAcademicYearFilter(e.target.value)}
            className="text-sm border border-[var(--app-border)] rounded px-2 py-1.5"
          >
            <option value="">Toutes</option>
            {academicYears.map((ay) => (
              <option key={ay.id} value={ay.id}>{ay.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Classe</label>
          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setRoomFilter("");
            }}
            className="text-sm border border-[var(--app-border)] rounded px-2 py-1.5"
          >
            <option value="">Toutes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Salle</label>
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="text-sm border border-[var(--app-border)] rounded px-2 py-1.5"
            disabled={!classFilter}
          >
            <option value="">Toutes</option>
            {rooms
              .filter((r) => !classFilter || r.class_id === classFilter)
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
          </select>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {/* Horaire des cours */}
      {tab === "cours" && (
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-900">Salles</h3>
            <div className="flex items-center gap-2">
              <ExportPdfButton
                sections={[{ lines: [pdfSubtitle] }, ...slotSectionsByDay]}
                mainTitle="Horaire des cours"
                filename={`horaire-cours${pdfFileSuffix}`}
                disabled={slotSectionsByDay.length === 0}
              />
              <Link to="/dashboard/rooms" className="text-sm text-[var(--school-accent-1)] hover:underline">
                Gérer les salles
              </Link>
            </div>
          </div>
          {roomsToShow.length === 0 ? (
            <div className="rounded-xl border border-[var(--app-border)] px-4 py-8 text-center text-slate-500">
              Aucune salle.{" "}
              <Link to="/dashboard/rooms" className="text-[var(--school-accent-1)] hover:underline">Créer une salle</Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {roomsToShow.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => openRoomGrid(room)}
                  className="rounded-xl border border-[var(--app-border)] bg-white p-4 text-left transition-colors hover:border-[var(--school-accent-1)] hover:bg-slate-50"
                >
                  <div className="font-semibold text-slate-900">{room.name}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{roomClassName(room) || "Classe non liée"}</div>
                  <div className="mt-2 text-xs text-slate-400">{roomSlotCount(room)} créneau{roomSlotCount(room) === 1 ? "" : "x"}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Horaire des examens */}
      {tab === "examens" && (
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-900">Salles</h3>
            <div className="flex items-center gap-2">
              <ExportPdfButton
                table={{
                  title: "Horaire des examens",
                  subtitle: pdfSubtitle,
                  columns: EXAM_COLUMNS,
                  rows: examRows,
                }}
                filename={`horaire-examens${pdfFileSuffix}`}
                disabled={examRows.length === 0}
              />
              <Link to="/dashboard/rooms" className="text-sm text-[var(--school-accent-1)] hover:underline">
                Gérer les salles
              </Link>
            </div>
          </div>
          {roomsToShow.length === 0 ? (
            <div className="rounded-xl border border-[var(--app-border)] px-4 py-8 text-center text-slate-500">
              Aucune salle.{" "}
              <Link to="/dashboard/rooms" className="text-[var(--school-accent-1)] hover:underline">Créer une salle</Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {roomsToShow.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => openRoomGrid(room)}
                  className="rounded-xl border border-[var(--app-border)] bg-white p-4 text-left transition-colors hover:border-[var(--school-accent-1)] hover:bg-slate-50"
                >
                  <div className="font-semibold text-slate-900">{room.name}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{roomClassName(room) || "Classe non liée"}</div>
                  <div className="mt-2 text-xs text-slate-400">{roomExamCount(room)} examen{roomExamCount(room) === 1 ? "" : "s"}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Activités parascolaires */}
      {tab === "parascolaires" && (
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-900">Activités parascolaires</h3>
            <div className="flex items-center gap-2">
              <ExportPdfButton
                table={{
                  title: "Activités parascolaires",
                  subtitle: pdfSubtitle,
                  columns: ACTIVITY_COLUMNS,
                  rows: activityRows,
                }}
                filename={`activites-parascolaires${pdfFileSuffix}`}
                disabled={activityRows.length === 0}
              />
              <button onClick={() => { setActivityForm((f) => ({ ...f, academic_year_id: defaultYearId })); setShowActivityForm(true); }} className="app-btn-primary text-sm py-2">Ajouter une activité</button>
            </div>
          </div>
          {showActivityForm && (
            <form onSubmit={handleAddActivity} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-xl">
              <h4 className="font-semibold text-slate-900">Nouvelle activité</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Année scolaire *</label>
                  <select value={activityForm.academic_year_id} onChange={(e) => setActivityForm((f) => ({ ...f, academic_year_id: e.target.value }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" required>
                    <option value="">Sélectionner</option>
                    {academicYears.map((ay) => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">Classes *</label>
                    {classes.length > 0 && (
                      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={classes.length > 0 && activityForm.class_ids.length === classes.length}
                          onChange={toggleAllActivityClasses}
                        />
                        Tout cocher
                      </label>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--app-border)] p-3 space-y-2">
                    {classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activityForm.class_ids.includes(c.id)}
                          onChange={() => toggleActivityClass(c.id)}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Occasion / Intitulé *</label>
                  <input type="text" value={activityForm.occasion} onChange={(e) => setActivityForm((f) => ({ ...f, occasion: e.target.value }))} placeholder="Sortie scolaire, match de foot..." className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                  <DateInputJJMMAAAA value={activityForm.activity_date} onChange={(activity_date) => setActivityForm((f) => ({ ...f, activity_date }))} className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Horaire</label>
                  <div className="flex gap-2">
                    <input type="time" value={activityForm.start_time} onChange={(e) => setActivityForm((f) => ({ ...f, start_time: e.target.value }))} className="flex-1 border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" />
                    <input type="time" value={activityForm.end_time} onChange={(e) => setActivityForm((f) => ({ ...f, end_time: e.target.value }))} className="flex-1 border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Participation (frais)</label>
                  <input type="text" value={activityForm.participation_fee} onChange={(e) => setActivityForm((f) => ({ ...f, participation_fee: e.target.value }))} placeholder="5000 FC" className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tenue</label>
                  <input type="text" value={activityForm.dress_code} onChange={(e) => setActivityForm((f) => ({ ...f, dress_code: e.target.value }))} placeholder="Uniforme scolaire" className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="app-btn-primary text-sm py-2 disabled:opacity-60">{saving ? "Enregistrement..." : "Enregistrer"}</button>
                <button type="button" onClick={() => setShowActivityForm(false)} className="app-btn-secondary text-sm py-2">Annuler</button>
              </div>
            </form>
          )}
          <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                <tr>
                  <th className="px-4 py-2 font-medium text-slate-900">Date</th>
                  <th className="px-4 py-2 font-medium text-slate-900">Horaire</th>
                  <th className="px-4 py-2 font-medium text-slate-900">Classe</th>
                  <th className="px-4 py-2 font-medium text-slate-900">Occasion</th>
                  <th className="px-4 py-2 font-medium text-slate-900">Frais</th>
                  <th className="px-4 py-2 font-medium text-slate-900">Code vestimentaire</th>
                  <th className="px-4 py-2 font-medium text-slate-900 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Aucune activité</td></tr>
                ) : (
                  activities.map((a) => (
                    <tr key={a.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                      <td className="px-4 py-2 text-slate-600">{formatDateJJMMAAAA(a.activity_date)}</td>
                      <td className="px-4 py-2 text-slate-600">{a.start_time} - {a.end_time}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{a.class_name}</td>
                      <td className="px-4 py-2 text-slate-700">{a.occasion}</td>
                      <td className="px-4 py-2 text-slate-600">{a.participation_fee ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{a.dress_code ?? "—"}</td>
                      <td className="px-4 py-2"><button onClick={() => handleDeleteActivity(a.id)} className="text-red-600 hover:underline text-xs">Supprimer</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {gridRoom && (
        <ScheduleGridModal
          title={`${gridRoom.name}${roomClassName(gridRoom) ? ` — ${roomClassName(gridRoom)}` : ""}`}
          subtitle={
            tab === "examens"
              ? "Cliquez une case pour placer un examen (07:00 – 19:00)."
              : "Cliquez une case pour placer un cours (07:00 – 19:00)."
          }
          mode={tab === "examens" ? "examens" : "cours"}
          subjects={gridSubjects}
          courseCells={courseCells}
          examCells={examCells}
          examWeekStart={examWeekStart}
          onExamWeekStart={setExamWeekStart}
          examPeriod={examGridPeriod}
          onExamPeriod={setExamGridPeriod}
          periods={periods}
          savingKey={savingCell}
          error={gridError}
          onClose={() => {
            setGridRoom(null);
            setGridError("");
            setSavingCell(null);
          }}
          onSelectCourse={handleCourseCell}
          onSelectExam={handleExamCell}
        />
      )}
    </div>
  );
}
