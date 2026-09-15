import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { formatDateJJMMAAAA } from "@/lib/format";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { ScheduleGridModal } from "@/components/ScheduleGridModal";
import { MaterialCatalogPicker } from "@/components/MaterialCatalogPicker";
import { AppAccordion } from "@/components/AppAccordion";
import { useRevealScroll } from "@/lib/useRevealScroll";
import type { PdfColumn, PdfSection } from "@/lib/pdfExport";
import {
  emptyWeekProgram,
  emptyDayProgram,
  isListScheduleLevel,
  MORNING_PRIMAIRE_LEVELS,
  MORNING_WEEKDAYS,
  namesJoin,
  programFromDuties,
  uniqueTeachersFromAssignments,
  dayHasPreschool,
  dayHasPrimary,
  emptyClassDayLists,
  classDayListsFromApi,
  mergeMaterialCatalog,
  toggleMaterialLabel,
  ensureMaterialLabel,
  type DayMorningProgram,
} from "@/lib/morningOpening";
import {
  cellKey,
  examCellKey,
  defaultExamRange,
} from "@/lib/scheduleGrid";
import { isMaterialsCycle, periodScopeFromLevel } from "@/lib/educationLevels";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
/** Semaine de classe : lundi → vendredi. */
const DAY_ORDER = [1, 2, 3, 4, 5];

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

const PRESCHOOL_MORNING_COLUMNS: PdfColumn[] = [
  { header: "Jour", key: "jour" },
  { header: "Accueil", key: "accueil" },
  { header: "Drapeau", key: "drapeau" },
  { header: "Animation", key: "animation" },
  { header: "Dames de service", key: "service" },
];

const PRIMARY_MORNING_COLUMNS: PdfColumn[] = [
  { header: "Jour", key: "jour" },
  { header: "Accueil", key: "accueil" },
  { header: "Dévotion", key: "devotion" },
  { header: "Drapeau", key: "drapeau" },
  { header: "Défi des 5 phrases", key: "defi" },
  { header: "Prière de midi", key: "priere" },
];

const LIST_DAY_COLUMNS: PdfColumn[] = [
  { header: "Jour", key: "jour" },
  { header: "Matières", key: "matieres" },
  { header: "Matériel à apporter", key: "materiel" },
];

const LIST_DAY_COLUMNS_NO_MAT: PdfColumn[] = [
  { header: "Jour", key: "jour" },
  { header: "Matières", key: "matieres" },
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

type ClassItem = { id: string; name: string; level?: string | null };
type Subject = { id: string; name: string };
type Room = { id: string; name: string; class_id?: string | null; active?: boolean };
type AcademicYear = { id: string; name: string };
type Period = { id: string; name: string; scope?: string };
type RoomAssignment = { teacher_id: number; teacher_name: string; subject_id: string };
type TeacherAssignment = { teacher_id: number; teacher_name: string; class_id: string; subject_id?: string; subject_name?: string };
type ClassMoment = {
  id: string;
  class_id: string;
  class_name?: string | null;
  kind: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string | null;
};
type SchoolDuty = {
  id: string;
  academic_year: string;
  kind: string;
  title: string;
  cycle?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  responsible_user_id: number | null;
  responsible_name: string | null;
  manual_name?: string | null;
};

function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function toggleStr(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function coursePdfSections(courseSlots: ScheduleSlot[], classMoments: ClassMoment[]): PdfSection[] {
  const sections: PdfSection[] = [];
  for (const day of DAY_ORDER) {
    const daySlots = courseSlots.filter((s) => s.day_of_week === day);
    if (daySlots.length === 0) continue;
    const courseRows = daySlots.map((s) => ({
      horaire: `${s.start_time} - ${s.end_time}`,
      classe: s.class_name,
      matiere: s.subject_name,
      professeur: s.teacher_name ?? "—",
      salle: s.room_name ?? "—",
      _start: s.start_time,
      _class: s.class_name,
    }));
    const momentRows = classMoments
      .filter((m) => m.day_of_week === day)
      .map((m) => ({
        horaire: `${m.start_time} - ${m.end_time}`,
        classe: m.class_name ?? "—",
        matiere: m.title,
        professeur: "—",
        salle: "—",
        _start: m.start_time,
        _class: m.class_name ?? "",
      }));
    const rows = [...momentRows, ...courseRows]
      .sort((a, b) => a._start.localeCompare(b._start) || a._class.localeCompare(b._class))
      .map(({ _start, _class, ...row }) => row);
    sections.push({ title: DAYS[day], table: { columns: SLOT_COLUMNS, rows } });
  }
  return sections;
}

function examPdfRows(list: ExamSchedule[]) {
  return [...list]
    .sort(
      (a, b) => a.exam_date.localeCompare(b.exam_date) || a.start_time.localeCompare(b.start_time),
    )
    .map((e) => ({
      date: formatDateJJMMAAAA(e.exam_date),
      horaire: `${e.start_time} - ${e.end_time}`,
      classe: e.class_name,
      matiere: e.subject_name,
      periode: e.period,
    }));
}

const PDF_BTN_CLASS =
  "rounded-lg px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-white disabled:opacity-50";

function TeacherChips({
  teachers,
  selected,
  onToggle,
  empty,
}: {
  teachers: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  empty: string;
}) {
  if (teachers.length === 0) {
    return <p className="text-xs text-amber-800/70">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {teachers.map((t) => {
        const on = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggle(t.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${
              on
                ? "bg-amber-800 text-white ring-amber-800"
                : "bg-white text-amber-950 ring-amber-100 hover:bg-amber-50"
            }`}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

function ManualNames({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const name = draft.trim();
    if (!name) return;
    if (values.some((v) => v.toLowerCase() === name.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, name]);
    setDraft("");
  }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="class-input min-w-0 flex-1 bg-white"
        />
        <button type="button" onClick={add} className="app-btn-secondary shrink-0 text-xs">
          Ajouter
        </button>
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(values.filter((v) => v !== name))}
              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-700"
            >
              {name} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InstructionLines({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const line = draft.trim();
    if (!line) return;
    onChange([...values, line]);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Consignes</p>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="class-input min-w-0 flex-1 bg-white"
        />
        <button type="button" onClick={add} className="app-btn-secondary shrink-0 text-xs">
          Ajouter
        </button>
      </div>
      {values.length > 0 ? (
        <ol className="space-y-1">
          {values.map((line, i) => (
            <li key={`${i}-${line}`} className="flex items-start justify-between gap-2 text-sm text-slate-800">
              <span>
                {i + 1}. {line}
              </span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                className="text-xs text-red-600 hover:underline"
              >
                Retirer
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

const WEEKDAYS = MORNING_WEEKDAYS;

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
  const [defaultPeriodName, setDefaultPeriodName] = useState("");
  const [defaultPreschoolPeriodName, setDefaultPreschoolPeriodName] = useState("");

  const [gridRoom, setGridRoom] = useState<Room | null>(null);
  const [gridSubjects, setGridSubjects] = useState<Subject[]>([]);
  const [gridAssignments, setGridAssignments] = useState<RoomAssignment[]>([]);
  const [gridError, setGridError] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [examRangeStart, setExamRangeStart] = useState(() => defaultExamRange().start);
  const [examRangeEnd, setExamRangeEnd] = useState(() => defaultExamRange().end);
  const [examGridPeriod, setExamGridPeriod] = useState("");

  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [classSubjectsById, setClassSubjectsById] = useState<Record<string, { id: string; name: string }[]>>({});
  const [moments, setMoments] = useState<ClassMoment[]>([]);
  const [duties, setDuties] = useState<SchoolDuty[]>([]);
  const [morningByDay, setMorningByDay] = useState<Record<number, DayMorningProgram>>(emptyWeekProgram);
  const [preschoolInstructions, setPreschoolInstructions] = useState<string[]>([]);
  const [primaryInstructions, setPrimaryInstructions] = useState<string[]>([]);
  const [staffPeople, setStaffPeople] = useState<{ id: number; name: string }[]>([]);
  const [dayListsByClass, setDayListsByClass] = useState<
    Record<string, Record<number, { subjectIds: string[]; materials: string[] }>>
  >({});
  const [listClass, setListClass] = useState<ClassItem | null>(null);
  const [listDraft, setListDraft] = useState(emptyClassDayLists);
  const [materialCatalog, setMaterialCatalog] = useState<string[]>([]);
  const [savingBring, setSavingBring] = useState(false);
  const [savingMorning, setSavingMorning] = useState(false);
  const [savingMoment, setSavingMoment] = useState(false);
  const [recessClassId, setRecessClassId] = useState("");
  const [recessStart, setRecessStart] = useState("10:00");
  const [recessEnd, setRecessEnd] = useState("10:15");
  const [recessLabel, setRecessLabel] = useState("");
  const [recessDays, setRecessDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [openCours, setOpenCours] = useState<"preschool" | "primary" | "recess" | "rooms">("rooms");

  const [showActivityForm, setShowActivityForm] = useState(false);
  const activityFormRef = useRevealScroll<HTMLFormElement>(showActivityForm);
  const emptyActivityForm = {
    academic_year_id: "",
    activity_date: "",
    start_time: "14:00",
    end_time: "16:00",
    class_ids: [] as string[],
    occasion: "",
    participation_fee: "",
    dress_code: "",
  };
  const [activityForm, setActivityForm] = useState(emptyActivityForm);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  async function loadRefs() {
    try {
      const [cRes, rRes, ayRes, aRes, staffRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/rooms`),
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/teachers/assignments`),
        fetchWithAuth(`${API_BASE}/school-week-duties/staff`),
      ]);
      const cData = await cRes.json();
      const rData = await rRes.json();
      const ayData = await ayRes.json();
      const aData = await aRes.json();
      const staffData = await staffRes.json().catch(() => ({}));
      if (!cRes.ok) throw new Error(cData.message || "Erreur classes");
      if (!rRes.ok) throw new Error(rData.message || "Erreur salles");
      if (!ayRes.ok) throw new Error(ayData.message || "Erreur années scolaires");
      setClasses(cData.classes ?? []);
      setRooms(rData.rooms ?? []);
      setAcademicYears(ayData.academic_years ?? []);
      setAssignments(aRes.ok ? (aData.assignments ?? []) : []);
      setStaffPeople(
        (staffRes.ok ? staffData.staff ?? [] : []).map((u: { id: number; name: string }) => ({
          id: u.id,
          name: u.name,
        })),
      );
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

  async function loadMomentsAndDuties(overrideYearId?: string) {
    try {
      const params = new URLSearchParams();
      const yearId = overrideYearId ?? academicYearFilter;
      const yearName = academicYears.find((ay) => ay.id === yearId)?.name || defaultYearName;
      if (yearName) params.set("academic_year", yearName);
      if (classFilter) params.set("class_id", classFilter);
      const [mRes, dRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/schedule-moments?${params}`),
        fetchWithAuth(`${API_BASE}/school-week-duties?${yearName ? `academic_year=${encodeURIComponent(yearName)}` : ""}`),
      ]);
      const mData = await mRes.json();
      const dData = await dRes.json();
      setMoments(mRes.ok ? (mData.schedule_moments ?? []) : []);
      const list: SchoolDuty[] = dRes.ok ? (dData.school_week_duties ?? []) : [];
      setDuties(list);
      setMorningByDay(programFromDuties(list));
      setPreschoolInstructions(dRes.ok ? (dData.preschool_instructions ?? []) : []);
      setPrimaryInstructions(dRes.ok ? (dData.primary_instructions ?? []) : []);
    } catch {
      setMoments([]);
      setDuties([]);
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
        setDefaultPeriodName(ctxData.current_period_name ?? "");
        setDefaultPreschoolPeriodName(ctxData.current_preschool_period_name ?? "");
        setAcademicYearFilter((prev) => (prev === "" ? defaultYearId! : prev));
      }
    } catch {
      /* ignore */
    }
    await Promise.all([
      loadSlots(defaultYearId),
      loadExams(),
      loadActivities(defaultYearId),
      loadMomentsAndDuties(defaultYearId),
    ]);
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
      loadMomentsAndDuties();
    }
  }, [academicYearFilter, classFilter, roomFilter]);

  useEffect(() => {
    loadPeriods(academicYearFilter || defaultYearId);
  }, [academicYearFilter, defaultYearId]);

  useEffect(() => {
    const list = classes.filter((c) => isListScheduleLevel(c.level));
    if (!list.length) return;
    void Promise.all(list.map((c) => loadDayLists(c.id)));
  }, [classes, academicYearFilter, defaultYearName]);

  useEffect(() => {
    if (!classes.length) {
      setClassSubjectsById({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      classes.map(async (c) => {
        try {
          const res = await fetchWithAuth(`${API_BASE}/classes/${c.id}/subjects`);
          const data = await res.json();
          return [c.id, res.ok ? (data.subjects ?? []) : []] as const;
        } catch {
          return [c.id, []] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setClassSubjectsById(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [classes]);

  async function openRoomGrid(room: Room) {
    const level = classes.find((c) => c.id === room.class_id)?.level;
    if (tab === "cours" && isListScheduleLevel(level) && room.class_id) {
      const cls = classes.find((c) => c.id === room.class_id) ?? { id: room.class_id, name: roomClassName(room), level };
      setListClass(cls);
      const lists = await loadDayLists(room.class_id);
      setListDraft(lists);
      return;
    }
    setGridRoom(room);
    setGridError("");
    setGridSubjects([]);
    setGridAssignments([]);
    if (tab === "examens") {
      const scope = periodScopeFromLevel(level);
      const scoped = periods.filter((p) => (p.scope || "ECOLE") === scope);
      const preferred =
        scope === "PRESCOLAIRE" ? defaultPreschoolPeriodName : defaultPeriodName;
      setExamGridPeriod((prev) => {
        if (prev && scoped.some((p) => p.name === prev)) return prev;
        if (preferred && scoped.some((p) => p.name === preferred)) return preferred;
        return scoped[0]?.name ?? "";
      });
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

  async function loadDayLists(classId: string) {
    const yearName = academicYears.find((ay) => ay.id === academicYearFilter)?.name || defaultYearName;
    const empty = emptyClassDayLists();
    try {
      const params = new URLSearchParams({ class_id: classId });
      if (yearName) params.set("academic_year", yearName);
      const res = await fetchWithAuth(`${API_BASE}/class-day-lists?${params}`);
      const data = await res.json();
      const next = classDayListsFromApi(data.days ?? []);
      setMaterialCatalog(mergeMaterialCatalog(data.catalog, ...Object.values(next).map((s) => s.materials)));
      setDayListsByClass((prev) => ({ ...prev, [classId]: next }));
      return next;
    } catch {
      setDayListsByClass((prev) => ({ ...prev, [classId]: prev[classId] ?? empty }));
      return empty;
    }
  }

  async function saveDayLists(
    classId: string,
    lists: Record<number, { subjectIds: string[]; materials: string[] }>,
  ) {
    const yearName = academicYears.find((ay) => ay.id === academicYearFilter)?.name || defaultYearName;
    setSavingBring(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/class-day-lists`, {
        method: "PUT",
        body: JSON.stringify({
          class_id: classId,
          academic_year: yearName || null,
          days: WEEKDAYS.map((d) => ({
            day_of_week: d.index,
            subject_ids: lists[d.index]?.subjectIds ?? [],
            materials: lists[d.index]?.materials ?? [],
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const next = classDayListsFromApi(data.days ?? []);
      setMaterialCatalog(mergeMaterialCatalog(data.catalog, ...Object.values(next).map((s) => s.materials)));
      setDayListsByClass((prev) => ({ ...prev, [classId]: next }));
      setListDraft(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingBring(false);
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

  async function handleSaveMorning() {
    const yearName = academicYears.find((ay) => ay.id === academicYearFilter)?.name || defaultYearName;
    if (!yearName) {
      setError("Choisissez une année scolaire pour le début de journée.");
      return;
    }
    setSavingMorning(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/school-week-duties`, {
        method: "PUT",
        body: JSON.stringify({
          academic_year: yearName,
          days: WEEKDAYS.map((d) => {
            const slot = morningByDay[d.index] ?? emptyWeekProgram()[d.index];
            return {
              day_of_week: d.index,
              preschool: {
                accueil_ids: slot.preschoolAccueilIds,
                flag_ids: slot.preschoolFlagIds,
                animation_ids: slot.preschoolAnimationIds,
                service_names: slot.preschoolServiceNames,
              },
              primary: {
                accueil_ids: slot.primaryAccueilIds,
                devotion_ids: slot.primaryDevotionIds,
                flag_class_id: slot.primaryFlagClassId || null,
                defi_ids: slot.primaryDefiIds,
                prayer_names: slot.primaryPrayerNames,
              },
            };
          }),
          preschool_instructions: preschoolInstructions,
          primary_instructions: primaryInstructions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const list: SchoolDuty[] = data.school_week_duties ?? [];
      setDuties(list);
      setMorningByDay(programFromDuties(list));
      setPreschoolInstructions(data.preschool_instructions ?? preschoolInstructions);
      setPrimaryInstructions(data.primary_instructions ?? primaryInstructions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingMorning(false);
    }
  }

  async function handleCreateMoment(payload: {
    kind: string;
    start_time: string;
    end_time: string;
    label: string;
    days: number[];
  }) {
    if (!gridRoom?.class_id) return;
    const yearName = academicYears.find((ay) => ay.id === academicYearFilter)?.name || defaultYearName;
    setSavingMoment(true);
    setGridError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/schedule-moments`, {
        method: "POST",
        body: JSON.stringify({
          class_id: gridRoom.class_id,
          academic_year: yearName || undefined,
          kind: payload.kind,
          start_time: payload.start_time,
          end_time: payload.end_time,
          label: payload.label || null,
          days: payload.days,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      await loadMomentsAndDuties();
    } catch (e) {
      setGridError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingMoment(false);
    }
  }

  async function handleDeleteMoment(id: string) {
    if (!confirm("Supprimer ce moment ?")) return;
    setSavingMoment(true);
    setGridError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/schedule-moments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).message || "Erreur");
      await loadMomentsAndDuties();
    } catch (e) {
      setGridError(e instanceof Error ? e.message : "Erreur");
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingMoment(false);
    }
  }

  async function handleCreateRecess() {
    if (!recessClassId) {
      setError("Choisissez une classe pour la récréation.");
      return;
    }
    if (!recessDays.length) {
      setError("Choisissez au moins un jour.");
      return;
    }
    const yearName = academicYears.find((ay) => ay.id === academicYearFilter)?.name || defaultYearName;
    setSavingMoment(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/schedule-moments`, {
        method: "POST",
        body: JSON.stringify({
          class_id: recessClassId,
          academic_year: yearName || undefined,
          kind: "RECESS",
          start_time: recessStart,
          end_time: recessEnd,
          label: recessLabel.trim() || null,
          days: recessDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      await loadMomentsAndDuties();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingMoment(false);
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
        examCellKey(ex.exam_date, ex.start_time) === key &&
        ex.period === examGridPeriod,
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

  async function handleSaveActivity(e: React.FormEvent) {
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
      const payload = {
        academic_year_id: activityForm.academic_year_id,
        activity_date: activityForm.activity_date,
        start_time: activityForm.start_time,
        end_time: activityForm.end_time,
        occasion: activityForm.occasion,
        participation_fee: activityForm.participation_fee || null,
        dress_code: activityForm.dress_code || null,
      };
      const res = editingActivityId
        ? await fetchWithAuth(`${API_BASE}/extracurricular-activities/${editingActivityId}`, {
            method: "PATCH",
            body: JSON.stringify({ ...payload, class_id: activityForm.class_ids[0] }),
          })
        : await fetchWithAuth(`${API_BASE}/extracurricular-activities`, {
            method: "POST",
            body: JSON.stringify({ ...payload, class_ids: activityForm.class_ids }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      closeActivityForm();
      loadActivities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function closeActivityForm() {
    setShowActivityForm(false);
    setEditingActivityId(null);
    setActivityForm(emptyActivityForm);
  }

  function openNewActivity() {
    setEditingActivityId(null);
    setActivityForm({ ...emptyActivityForm, academic_year_id: defaultYearId });
    setShowActivityForm(true);
  }

  function openEditActivity(a: ExtracurricularActivity) {
    setEditingActivityId(a.id);
    setActivityForm({
      academic_year_id: a.academic_year_id || defaultYearId,
      activity_date: (a.activity_date || "").slice(0, 10),
      start_time: a.start_time || "14:00",
      end_time: a.end_time || "16:00",
      class_ids: a.class_id ? [a.class_id] : [],
      occasion: a.occasion || "",
      participation_fee: a.participation_fee || "",
      dress_code: a.dress_code || "",
    });
    setShowActivityForm(true);
  }

  function toggleActivityClass(id: string) {
    setActivityForm((f) => {
      if (editingActivityId) return { ...f, class_ids: [id] };
      return {
        ...f,
        class_ids: f.class_ids.includes(id)
          ? f.class_ids.filter((x) => x !== id)
          : [...f.class_ids, id],
      };
    });
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

  const slotSectionsByDay = useMemo<PdfSection[]>(
    () => coursePdfSections(slots, moments),
    [slots, moments],
  );

  const examRows = useMemo(() => examPdfRows(exams), [exams]);

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

  const flagClasses = useMemo(
    () => classes.filter((c) => (MORNING_PRIMAIRE_LEVELS as readonly string[]).includes(c.level ?? "")),
    [classes],
  );
  const preschoolClassIds = useMemo(
    () => new Set(classes.filter((c) => c.level === "PRESCOLAIRE").map((c) => c.id)),
    [classes],
  );
  const primaryClassIds = useMemo(
    () =>
      new Set(
        classes.filter((c) => (MORNING_PRIMAIRE_LEVELS as readonly string[]).includes(c.level ?? "")).map((c) => c.id),
      ),
    [classes],
  );
  const preschoolTeachers = useMemo(
    () => uniqueTeachersFromAssignments(assignments, preschoolClassIds),
    [assignments, preschoolClassIds],
  );
  const primaryTeachers = useMemo(
    () => uniqueTeachersFromAssignments(assignments, primaryClassIds),
    [assignments, primaryClassIds],
  );
  const recessMoments = useMemo(
    () => moments.filter((m) => m.kind === "RECESS"),
    [moments],
  );
  const preschoolDaysCount = useMemo(
    () => WEEKDAYS.filter((d) => dayHasPreschool(morningByDay[d.index])).length,
    [morningByDay],
  );
  const primaryDaysCount = useMemo(
    () => WEEKDAYS.filter((d) => dayHasPrimary(morningByDay[d.index])).length,
    [morningByDay],
  );

  function dutyNames(day: number, kind: string, cycle: string) {
    return namesJoin(
      duties
        .filter((x) => x.kind === kind && x.cycle === cycle && x.day_of_week === day)
        .map((x) => x.responsible_name || x.manual_name)
        .filter((n): n is string => !!n),
    );
  }

  const preschoolPdfRows = useMemo(
    () =>
      WEEKDAYS.map((d) => ({
        jour: d.label,
        accueil: dutyNames(d.index, "ACCUEIL", "PRESCOLAIRE"),
        drapeau: dutyNames(d.index, "FLAG", "PRESCOLAIRE"),
        animation: dutyNames(d.index, "ANIMATION", "PRESCOLAIRE"),
        service: dutyNames(d.index, "SERVICE", "PRESCOLAIRE"),
      })),
    [duties],
  );
  const primaryPdfRows = useMemo(
    () =>
      WEEKDAYS.map((d) => {
        const flag = duties.find(
          (x) => x.kind === "FLAG" && x.cycle === "PRIMAIRE" && x.day_of_week === d.index,
        );
        return {
          jour: d.label,
          accueil: dutyNames(d.index, "ACCUEIL", "PRIMAIRE"),
          devotion: dutyNames(d.index, "DEVOTION", "PRIMAIRE"),
          drapeau: flag?.class_name ?? "—",
          defi: dutyNames(d.index, "DEFI", "PRIMAIRE"),
          priere: dutyNames(d.index, "PRIERE", "PRIMAIRE"),
        };
      }),
    [duties],
  );

  const preschoolPdfSections = useMemo<PdfSection[]>(() => {
    const sections: PdfSection[] = [];
    if (filterLabels.year) {
      sections.push({ lines: [`Année scolaire : ${filterLabels.year}`] });
    }
    if (preschoolInstructions.length) {
      sections.push({
        title: "Consignes",
        lines: preschoolInstructions.map((l, i) => `${i + 1}. ${l}`),
      });
    }
    sections.push({
      title: "Organisation de la semaine",
      table: { columns: PRESCHOOL_MORNING_COLUMNS, rows: preschoolPdfRows },
    });
    return sections;
  }, [filterLabels.year, preschoolPdfRows, preschoolInstructions]);
  const primaryPdfSections = useMemo<PdfSection[]>(() => {
    const sections: PdfSection[] = [];
    if (filterLabels.year) {
      sections.push({ lines: [`Année scolaire : ${filterLabels.year}`] });
    }
    if (primaryInstructions.length) {
      sections.push({
        title: "Consignes",
        lines: primaryInstructions.map((l, i) => `${i + 1}. ${l}`),
      });
    }
    sections.push({
      title: "Organisation de la semaine",
      table: { columns: PRIMARY_MORNING_COLUMNS, rows: primaryPdfRows },
    });
    return sections;
  }, [filterLabels.year, primaryPdfRows, primaryInstructions]);

  const allSchedulesSections = useMemo<PdfSection[]>(() => {
    const sections: PdfSection[] = [];
    if (pdfSubtitle) sections.push({ lines: [pdfSubtitle] });
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

  const groupedRooms = (() => {
    const by = new Map<string, { title: string; classId: string | null; items: Room[] }>();
    for (const room of roomsToShow) {
      const key = room.class_id || "_";
      const title = classes.find((c) => c.id === room.class_id)?.name || "Sans classe";
      const g = by.get(key);
      if (g) g.items.push(room);
      else by.set(key, { title, classId: room.class_id || null, items: [room] });
    }
    return [...by.values()];
  })();

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
      if (examGridPeriod && ex.period !== examGridPeriod) continue;
      const date = (ex.exam_date || "").slice(0, 10);
      map[examCellKey(date, ex.start_time)] = { id: ex.id, subject_id: ex.subject_id };
    }
    return map;
  }, [exams, gridRoom, examGridPeriod]);

  function roomClassName(room: Room) {
    return classes.find((c) => c.id === room.class_id)?.name ?? "";
  }

  function roomSlotCount(room: Room) {
    return slots.filter((s) => s.room_id === room.id).length;
  }

  function classSubjectOptions(classId: string) {
    const fromClass = classSubjectsById[classId] ?? [];
    if (fromClass.length > 0) {
      return [...fromClass]
        .map((s) => ({ id: s.id, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }
    const map = new Map<string, string>();
    for (const a of assignments) {
      if (a.class_id !== classId || !a.subject_id || !a.subject_name) continue;
      if (!map.has(a.subject_id)) map.set(a.subject_id, a.subject_name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  function listClassPdfSections(classId: string): PdfSection[] {
    const lists = dayListsByClass[classId] ?? emptyClassDayLists();
    const options = classSubjectOptions(classId);
    const nameOf = (id: string) => options.find((s) => s.id === id)?.name ?? id;
    const level = classes.find((c) => c.id === classId)?.level;
    const withMaterials = isMaterialsCycle(level);
    const sections: PdfSection[] = [
      {
        title: "Emploi du temps",
        table: {
          columns: withMaterials ? LIST_DAY_COLUMNS : LIST_DAY_COLUMNS_NO_MAT,
          rows: WEEKDAYS.map((d) => {
            const slot = lists[d.index] ?? { subjectIds: [], materials: [] };
            return {
              jour: d.label,
              matieres: namesJoin(slot.subjectIds.map(nameOf).filter(Boolean)),
              materiel: namesJoin(slot.materials),
            };
          }),
        },
      },
    ];
    const recess = moments
      .filter((m) => m.class_id === classId && m.kind === "RECESS")
      .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
    if (recess.length) {
      sections.push({
        title: "Récréations",
        table: {
          columns: [
            { header: "Jour", key: "jour" },
            { header: "Horaire", key: "horaire" },
            { header: "Libellé", key: "label" },
          ],
          rows: recess.map((m) => ({
            jour: DAYS[m.day_of_week] ?? String(m.day_of_week),
            horaire: `${m.start_time} - ${m.end_time}`,
            label: m.label || m.title || "Récréation",
          })),
        },
      });
    }
    return sections;
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  const roomCard = (room: Room, kind: "cours" | "examens") => {
    const klass = roomClassName(room);
    const level = classes.find((c) => c.id === room.class_id)?.level;
    const listMode = kind === "cours" && isListScheduleLevel(level);
    const lists = room.class_id ? dayListsByClass[room.class_id] : undefined;
    const count = listMode
      ? WEEKDAYS.filter((d) => {
          const slot = lists?.[d.index];
          return !!slot && (slot.subjectIds.length > 0 || slot.materials.length > 0);
        }).length
      : kind === "cours"
        ? roomSlotCount(room)
        : roomExamCount(room);
    const subtitle = [
      `Année : ${filterLabels.year ?? "toutes"}`,
      klass ? `Classe : ${klass}` : null,
      `Salle : ${room.name}`,
    ]
      .filter((v): v is string => !!v)
      .join("  ·  ");
    const listSections = room.class_id && listMode ? listClassPdfSections(room.class_id) : [];
    const courseSections = coursePdfSections(
      slots.filter((s) => s.room_id === room.id),
      room.class_id ? moments.filter((m) => m.class_id === room.class_id) : [],
    );
    const roomExamRows = examPdfRows(
      room.class_id ? exams.filter((e) => e.class_id === room.class_id) : [],
    );
    return (
      <article
        key={room.id}
        className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
      >
        <button type="button" onClick={() => openRoomGrid(room)} className="flex w-full text-left">
          <span className="w-1.5 shrink-0 bg-[var(--school-accent-1)]" />
          <div className="min-w-0 flex-1 p-4">
            <h4 className="truncate text-base font-bold text-slate-900">Salle {room.name}</h4>
            <p className="mt-0.5 text-xs text-slate-500">{klass || "Classe non liée"}</p>
            <div
              className={`mt-3 inline-flex rounded-xl px-3 py-2 ${
                kind === "cours"
                  ? "bg-teal-50 text-teal-800 ring-1 ring-teal-100"
                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
              }`}
            >
              <span className="text-lg font-semibold leading-none">{count}</span>
              <span className="ml-2 text-[11px] font-medium opacity-80">
                {kind === "cours"
                  ? listMode
                    ? count > 1
                      ? "jours"
                      : "jour"
                    : count > 1
                      ? "créneaux"
                      : "créneau"
                  : count > 1
                    ? "examens"
                    : "examen"}
              </span>
            </div>
          </div>
        </button>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-3 py-2">
          <button
            type="button"
            onClick={() => openRoomGrid(room)}
            className="text-xs font-medium text-teal-800 hover:underline"
          >
            Ouvrir {listMode ? "la liste" : "la grille"}
          </button>
          {kind === "cours" ? (
            <ExportPdfButton
              sections={[{ lines: [subtitle] }, ...(listMode ? listSections : courseSections)]}
              mainTitle={`Horaire des cours — Salle ${room.name}`}
              filename={`horaire-cours-salle-${slugify(room.name)}${pdfFileSuffix}`}
              disabled={listMode ? listSections.length === 0 : courseSections.length === 0}
              label="PDF"
              className={PDF_BTN_CLASS}
            />
          ) : (
            <ExportPdfButton
              table={{
                title: `Horaire des examens — Salle ${room.name}`,
                subtitle,
                columns: EXAM_COLUMNS,
                rows: roomExamRows,
              }}
              filename={`horaire-examens-salle-${slugify(room.name)}${pdfFileSuffix}`}
              disabled={roomExamRows.length === 0}
              label="PDF"
              className={PDF_BTN_CLASS}
            />
          )}
        </div>
      </article>
    );
  };

  const classPdfButton = (kind: "cours" | "examens", classId: string, className: string) => {
    const subtitle = [`Année : ${filterLabels.year ?? "toutes"}`, `Classe : ${className}`].join("  ·  ");
    if (kind === "cours") {
      const cls = classes.find((c) => c.id === classId);
      if (isListScheduleLevel(cls?.level)) {
        const sections = listClassPdfSections(classId);
        return (
          <ExportPdfButton
            sections={[{ lines: [subtitle] }, ...sections]}
            mainTitle={`Horaire — ${className}`}
            filename={`horaire-${slugify(className)}${pdfFileSuffix}`}
            disabled={sections.length === 0}
            label="PDF"
            className={PDF_BTN_CLASS}
          />
        );
      }
      const sections = coursePdfSections(
        slots.filter((s) => s.class_id === classId),
        moments.filter((m) => m.class_id === classId),
      );
      return (
        <ExportPdfButton
          sections={[{ lines: [subtitle] }, ...sections]}
          mainTitle={`Horaire des cours — ${className}`}
          filename={`horaire-cours-${slugify(className)}${pdfFileSuffix}`}
          disabled={sections.length === 0}
          label="PDF"
          className={PDF_BTN_CLASS}
        />
      );
    }
    const rows = examPdfRows(exams.filter((e) => e.class_id === classId));
    return (
      <ExportPdfButton
        table={{
          title: `Horaire des examens — ${className}`,
          subtitle,
          columns: EXAM_COLUMNS,
          rows,
        }}
        filename={`horaire-examens-${slugify(className)}${pdfFileSuffix}`}
        disabled={rows.length === 0}
        label="PDF"
        className={PDF_BTN_CLASS}
      />
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Organisation</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Horaires</h2>
        </div>
        <ExportPdfButton
          sections={allSchedulesSections}
          mainTitle="Horaires de l'école"
          filename={`horaires${pdfFileSuffix}`}
          label="Tout exporter"
          disabled={!hasAnySchedule}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
          {(["cours", "examens", "parascolaires"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t === "cours" ? "Cours" : t === "examens" ? "Examens" : "Parascolaire"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Année</label>
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
              className="class-input max-w-[11rem] bg-white"
            >
              <option value="">Toutes</option>
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Classe</label>
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setRoomFilter("");
              }}
              className="class-input class-input-name bg-white"
            >
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Salle</label>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="class-input class-input-room bg-white"
              disabled={!classFilter}
            >
              <option value="">Toutes</option>
              {rooms
                .filter((r) => !classFilter || r.class_id === classFilter)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
      ) : null}

      {tab === "cours" ? (
        <section className="space-y-3">
          <AppAccordion
            tone="amber"
            kicker="Préscolaire"
            title="Rentrée préscolaire"
            summary={
              preschoolDaysCount === 0
                ? "Aucun jour programmé"
                : `${preschoolDaysCount} jour${preschoolDaysCount > 1 ? "s" : ""}`
            }
            open={openCours === "preschool"}
            onToggle={() => setOpenCours("preschool")}
            headerRight={
              <ExportPdfButton
                sections={preschoolPdfSections}
                mainTitle="Programme de rentrée — Préscolaire"
                filename={`rentree-prescolaire${pdfFileSuffix}`}
                disabled={preschoolDaysCount === 0 && preschoolInstructions.length === 0}
                orientation="landscape"
              />
            }
          >
            {!(academicYearFilter || defaultYearId) ? (
              <p className="text-sm text-amber-800">Choisissez une année scolaire.</p>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {WEEKDAYS.map((d) => {
                    const slot = morningByDay[d.index] ?? emptyDayProgram();
                    return (
                      <div key={d.index} className="rounded-xl bg-white/90 p-3 ring-1 ring-amber-100">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                          {d.label}
                        </p>
                        <p className="mb-1 text-[11px] font-medium text-slate-600">Accueil</p>
                        <TeacherChips
                          teachers={preschoolTeachers}
                          selected={slot.preschoolAccueilIds}
                          empty="Aucun professeur préscolaire."
                          onToggle={(id) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, preschoolAccueilIds: toggleId(slot.preschoolAccueilIds, id) },
                            }))
                          }
                        />
                        <p className="mb-1 mt-3 text-[11px] font-medium text-slate-600">Montée du drapeau</p>
                        <TeacherChips
                          teachers={preschoolTeachers}
                          selected={slot.preschoolFlagIds}
                          empty="Aucun professeur préscolaire."
                          onToggle={(id) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, preschoolFlagIds: toggleId(slot.preschoolFlagIds, id) },
                            }))
                          }
                        />
                        <p className="mb-1 mt-3 text-[11px] font-medium text-slate-600">Animation</p>
                        <TeacherChips
                          teachers={preschoolTeachers}
                          selected={slot.preschoolAnimationIds}
                          empty="Aucun professeur préscolaire."
                          onToggle={(id) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, preschoolAnimationIds: toggleId(slot.preschoolAnimationIds, id) },
                            }))
                          }
                        />
                        <p className="mb-1 mt-3 text-[11px] font-medium text-slate-600">Dames de service</p>
                        <ManualNames
                          values={slot.preschoolServiceNames}
                          onChange={(preschoolServiceNames) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, preschoolServiceNames },
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-xl bg-white/90 p-3 ring-1 ring-amber-100">
                  <InstructionLines values={preschoolInstructions} onChange={setPreschoolInstructions} />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveMorning()}
                  disabled={savingMorning}
                  className="mt-3 app-btn-primary text-sm py-2 disabled:opacity-60"
                >
                  {savingMorning ? "Enregistrement…" : "Enregistrer"}
                </button>
              </>
            )}
          </AppAccordion>

          <AppAccordion
            tone="teal"
            kicker="Primaire"
            title="Rentrée primaire"
            summary={
              primaryDaysCount === 0
                ? "Aucun jour programmé"
                : `${primaryDaysCount} jour${primaryDaysCount > 1 ? "s" : ""}`
            }
            open={openCours === "primary"}
            onToggle={() => setOpenCours("primary")}
            headerRight={
              <ExportPdfButton
                sections={primaryPdfSections}
                mainTitle="Programme de rentrée — Primaire"
                filename={`rentree-primaire${pdfFileSuffix}`}
                disabled={primaryDaysCount === 0 && primaryInstructions.length === 0}
                orientation="landscape"
              />
            }
          >
            {!(academicYearFilter || defaultYearId) ? (
              <p className="text-sm text-teal-800">Choisissez une année scolaire.</p>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {WEEKDAYS.map((d) => {
                    const slot = morningByDay[d.index] ?? emptyDayProgram();
                    return (
                      <div key={d.index} className="rounded-xl bg-white/90 p-3 ring-1 ring-teal-100">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
                          {d.label}
                        </p>
                        <p className="mb-1 text-[11px] font-medium text-slate-600">Accueil</p>
                        <TeacherChips
                          teachers={primaryTeachers}
                          selected={slot.primaryAccueilIds}
                          empty="Aucun professeur primaire."
                          onToggle={(id) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, primaryAccueilIds: toggleId(slot.primaryAccueilIds, id) },
                            }))
                          }
                        />
                        <p className="mb-1 mt-3 text-[11px] font-medium text-slate-600">Dévotion</p>
                        <TeacherChips
                          teachers={primaryTeachers}
                          selected={slot.primaryDevotionIds}
                          empty="Aucun professeur primaire."
                          onToggle={(id) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, primaryDevotionIds: toggleId(slot.primaryDevotionIds, id) },
                            }))
                          }
                        />
                        <label className="mb-1 mt-3 block text-[11px] font-medium text-slate-600">
                          Montée du drapeau
                        </label>
                        <select
                          value={slot.primaryFlagClassId}
                          onChange={(e) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, primaryFlagClassId: e.target.value },
                            }))
                          }
                          className="class-input mb-3 w-full bg-white"
                        >
                          <option value="">— Classe —</option>
                          {flagClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <p className="mb-1 text-[11px] font-medium text-slate-600">Défi des 5 phrases</p>
                        <TeacherChips
                          teachers={staffPeople}
                          selected={slot.primaryDefiIds}
                          empty="Aucun responsable (hors parent et professeur)."
                          onToggle={(id) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, primaryDefiIds: toggleId(slot.primaryDefiIds, id) },
                            }))
                          }
                        />
                        <p className="mb-1 mt-3 text-[11px] font-medium text-slate-600">Prière de midi</p>
                        <ManualNames
                          values={slot.primaryPrayerNames}
                          onChange={(primaryPrayerNames) =>
                            setMorningByDay((prev) => ({
                              ...prev,
                              [d.index]: { ...slot, primaryPrayerNames },
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-xl bg-white/90 p-3 ring-1 ring-teal-100">
                  <InstructionLines values={primaryInstructions} onChange={setPrimaryInstructions} />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveMorning()}
                  disabled={savingMorning}
                  className="mt-3 app-btn-primary text-sm py-2 disabled:opacity-60"
                >
                  {savingMorning ? "Enregistrement…" : "Enregistrer"}
                </button>
              </>
            )}
          </AppAccordion>

          <AppAccordion
            tone="teal"
            kicker="Classes"
            title="Récréations"
            summary={
              recessMoments.length === 0
                ? "Aucune récréation"
                : `${recessMoments.length} créneau${recessMoments.length > 1 ? "x" : ""}`
            }
            open={openCours === "recess"}
            onToggle={() => setOpenCours("recess")}
          >
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Classe</label>
                <select
                  value={recessClassId}
                  onChange={(e) => setRecessClassId(e.target.value)}
                  className="class-input min-w-[10rem] bg-white"
                >
                  <option value="">— Classe —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Début</label>
                <input
                  type="time"
                  value={recessStart}
                  onChange={(e) => setRecessStart(e.target.value)}
                  className="class-input w-[7.5rem]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Fin</label>
                <input
                  type="time"
                  value={recessEnd}
                  onChange={(e) => setRecessEnd(e.target.value)}
                  className="class-input w-[7.5rem]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Libellé</label>
                <input
                  value={recessLabel}
                  onChange={(e) => setRecessLabel(e.target.value)}
                  placeholder="Récréation"
                  className="class-input class-input-name"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = recessDays.includes(d.index);
                  return (
                    <button
                      key={d.index}
                      type="button"
                      onClick={() =>
                        setRecessDays((prev) =>
                          prev.includes(d.index)
                            ? prev.filter((x) => x !== d.index)
                            : [...prev, d.index].sort(),
                        )
                      }
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                        on ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-200"
                      }`}
                    >
                      {d.label.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void handleCreateRecess()}
                disabled={savingMoment}
                className="app-btn-primary text-sm py-2 disabled:opacity-60"
              >
                {savingMoment ? "…" : "Caler"}
              </button>
            </div>
            {recessMoments.length > 0 ? (
              <ul className="mt-3 divide-y divide-teal-100 overflow-hidden rounded-xl bg-white ring-1 ring-teal-100">
                {recessMoments
                  .slice()
                  .sort(
                    (a, b) =>
                      (a.class_name ?? "").localeCompare(b.class_name ?? "", "fr") ||
                      a.day_of_week - b.day_of_week ||
                      a.start_time.localeCompare(b.start_time),
                  )
                  .map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium text-slate-900">{m.class_name ?? "Classe"}</span>
                        <span className="text-slate-500">
                          {" · "}
                          {DAYS[m.day_of_week] ?? m.day_of_week} {m.start_time}–{m.end_time}
                          {m.label ? ` · ${m.label}` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteMoment(m.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Supprimer
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-teal-800/70">Aucune récréation calée.</p>
            )}
          </AppAccordion>


          <AppAccordion
            tone="slate"
            kicker="Grille"
            title="Salles"
            summary={`${roomsToShow.length} salle${roomsToShow.length > 1 ? "s" : ""}`}
            open={openCours === "rooms"}
            onToggle={() => setOpenCours("rooms")}
            headerRight={
              <Link
                to="/dashboard/classes"
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-white"
              >
                Classes
              </Link>
            }
          >
            {roomsToShow.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
                <p className="font-medium text-slate-700">Aucune salle</p>
                <Link to="/dashboard/classes" className="mt-1 inline-block text-sm text-teal-800">
                  Créer une salle
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {groupedRooms.map((group) => (
                  <div key={group.title} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {group.title}
                      </h4>
                      <span className="h-px flex-1 bg-slate-200" />
                      {group.classId ? classPdfButton("cours", group.classId, group.title) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {group.items.map((room) => roomCard(room, "cours"))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AppAccordion>
        </section>
      ) : null}

      {tab === "examens" ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Salles</h3>
            <Link
              to="/dashboard/classes"
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-white"
            >
              Classes
            </Link>
          </div>
          {roomsToShow.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
              <p className="font-medium text-slate-700">Aucune salle</p>
              <Link to="/dashboard/classes" className="mt-1 inline-block text-sm text-teal-800">
                Créer une salle
              </Link>
            </div>
          ) : (
            groupedRooms.map((group) => (
              <div key={group.title} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {group.title}
                  </h4>
                  <span className="h-px flex-1 bg-slate-200" />
                  {group.classId ? classPdfButton("examens", group.classId, group.title) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((room) => roomCard(room, "examens"))}
                </div>
              </div>
            ))
          )}
        </section>
      ) : null}

      {tab === "parascolaires" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Activités
            </h3>
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
              <button
                onClick={openNewActivity}
                className="app-btn-primary text-sm py-2"
              >
                Ajouter
              </button>
            </div>
          </div>
          {showActivityForm ? (
            <form
              ref={activityFormRef}
              onSubmit={handleSaveActivity}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">
                  {editingActivityId ? "Modifier" : "Nouvelle activité"}
                </h4>
                <button
                  type="button"
                  onClick={closeActivityForm}
                  className="text-xs font-medium text-slate-500"
                >
                  Fermer
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Année</label>
                  <select
                    value={activityForm.academic_year_id}
                    onChange={(e) => setActivityForm((f) => ({ ...f, academic_year_id: e.target.value }))}
                    className="class-input max-w-[12rem] bg-white"
                    required
                  >
                    <option value="">Sélectionner</option>
                    {academicYears.map((ay) => (
                      <option key={ay.id} value={ay.id}>
                        {ay.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Occasion</label>
                  <input
                    type="text"
                    value={activityForm.occasion}
                    onChange={(e) => setActivityForm((f) => ({ ...f, occasion: e.target.value }))}
                    placeholder="Sortie, match…"
                    className="class-input w-full max-w-[16rem]"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Date</label>
                  <DateInputJJMMAAAA
                    value={activityForm.activity_date}
                    onChange={(activity_date) => setActivityForm((f) => ({ ...f, activity_date }))}
                    className="class-input"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Début</label>
                  <input
                    type="time"
                    value={activityForm.start_time}
                    onChange={(e) => setActivityForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="class-input w-[7.5rem]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Fin</label>
                  <input
                    type="time"
                    value={activityForm.end_time}
                    onChange={(e) => setActivityForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="class-input w-[7.5rem]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Frais</label>
                  <input
                    type="text"
                    value={activityForm.participation_fee}
                    onChange={(e) => setActivityForm((f) => ({ ...f, participation_fee: e.target.value }))}
                    placeholder="—"
                    className="class-input class-input-name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Tenue</label>
                  <input
                    type="text"
                    value={activityForm.dress_code}
                    onChange={(e) => setActivityForm((f) => ({ ...f, dress_code: e.target.value }))}
                    placeholder="—"
                    className="class-input class-input-name"
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600">Classes</span>
                  {!editingActivityId && classes.length > 0 ? (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={classes.length > 0 && activityForm.class_ids.length === classes.length}
                        onChange={toggleAllActivityClasses}
                      />
                      Tout
                    </label>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((c) => {
                    const on = activityForm.class_ids.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                          on ? "bg-teal-600 text-white ring-teal-600" : "bg-white text-slate-600 ring-slate-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() => toggleActivityClass(c.id)}
                        />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="app-btn-primary text-sm py-2 disabled:opacity-60">
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  type="button"
                  onClick={closeActivityForm}
                  className="app-btn-secondary text-sm py-2"
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : null}

          {activities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center text-slate-500">
              Aucune activité
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {activities.map((a) => (
                <article
                  key={a.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex">
                    <span className="w-1.5 shrink-0 bg-amber-400" />
                    <div className="min-w-0 flex-1 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                        {formatDateJJMMAAAA(a.activity_date)} · {a.start_time}–{a.end_time}
                      </p>
                      <h4 className="mt-0.5 font-bold text-slate-900">{a.occasion}</h4>
                      <p className="mt-1 text-sm text-slate-500">{a.class_name}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.participation_fee ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            {a.participation_fee}
                          </span>
                        ) : null}
                        {a.dress_code ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">
                            {a.dress_code}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 border-t border-slate-100 bg-slate-50/80 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openEditActivity(a)}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-white"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteActivity(a.id)}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-white"
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {listClass ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="mt-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700">Liste</p>
                <h3 className="text-lg font-bold text-slate-900">{listClass.name}</h3>
              </div>
              <button type="button" onClick={() => setListClass(null)} className="app-btn-secondary text-sm">
                Fermer
              </button>
            </div>
            <div className="space-y-4">
              {WEEKDAYS.map((d) => {
                const slot = listDraft[d.index] ?? { subjectIds: [] as string[], materials: [] as string[] };
                const options = classSubjectOptions(listClass.id);
                return (
                  <div key={d.index} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">{d.label}</p>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Matières
                      </p>
                      {options.length === 0 ? (
                        <p className="text-sm text-slate-500">Aucune matière dans Classes.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {options.map((s) => {
                            const on = slot.subjectIds.includes(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() =>
                                  setListDraft((prev) => ({
                                    ...prev,
                                    [d.index]: {
                                      ...slot,
                                      subjectIds: toggleStr(slot.subjectIds, s.id),
                                    },
                                  }))
                                }
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                                  on
                                    ? "bg-teal-700 text-white ring-teal-700"
                                    : "bg-white text-slate-700 ring-slate-200"
                                }`}
                              >
                                {s.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {isMaterialsCycle(listClass.level) ? (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Matériel à apporter
                      </p>
                      <MaterialCatalogPicker
                        catalog={mergeMaterialCatalog(
                          materialCatalog,
                          ...Object.values(listDraft).map((s) => s.materials),
                        )}
                        selected={slot.materials}
                        onToggle={(label) =>
                          setListDraft((prev) => ({
                            ...prev,
                            [d.index]: { ...slot, materials: toggleMaterialLabel(slot.materials, label) },
                          }))
                        }
                        onCreate={(label) => {
                          setMaterialCatalog((prev) => mergeMaterialCatalog(prev, [label]));
                          setListDraft((prev) => ({
                            ...prev,
                            [d.index]: { ...slot, materials: ensureMaterialLabel(slot.materials, label) },
                          }));
                        }}
                      />
                    </div>
                    ) : null}
                  </div>
                );
              })}
              <button
                type="button"
                disabled={savingBring}
                onClick={() => void saveDayLists(listClass.id, listDraft)}
                className="app-btn-primary text-sm disabled:opacity-60"
              >
                {savingBring ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {gridRoom ? (
        <ScheduleGridModal
          title={`${gridRoom.name}${roomClassName(gridRoom) ? ` — ${roomClassName(gridRoom)}` : ""}`}
          mode={tab === "examens" ? "examens" : "cours"}
          subjects={gridSubjects}
          courseCells={courseCells}
          examCells={examCells}
          examRangeStart={examRangeStart}
          examRangeEnd={examRangeEnd}
          onExamRangeStart={setExamRangeStart}
          onExamRangeEnd={setExamRangeEnd}
          examPeriod={examGridPeriod}
          onExamPeriod={setExamGridPeriod}
          periods={periods.filter(
            (p) =>
              (p.scope || "ECOLE") ===
              periodScopeFromLevel(classes.find((c) => c.id === gridRoom?.class_id)?.level),
          )}
          savingKey={savingCell}
          error={gridError}
          onClose={() => {
            setGridRoom(null);
            setGridError("");
            setSavingCell(null);
          }}
          onSelectCourse={handleCourseCell}
          onSelectExam={handleExamCell}
          classMoments={
            gridRoom?.class_id ? moments.filter((m) => m.class_id === gridRoom.class_id) : []
          }
          schoolDuties={duties}
          classId={gridRoom?.class_id ?? null}
          classLevel={classes.find((c) => c.id === gridRoom?.class_id)?.level ?? null}
          onCreateMoment={tab === "cours" ? handleCreateMoment : undefined}
          onDeleteMoment={tab === "cours" ? handleDeleteMoment : undefined}
          momentsBusy={savingMoment}
        />
      ) : null}
    </div>
  );
}
