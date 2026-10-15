import { API_BASE, fetchWithAuth } from "@/services/api";
import { formatDateJJMMAAAA } from "@/lib/format";
import {
  classDayListsFromApi,
  isListScheduleLevel,
  MORNING_WEEKDAYS,
  namesJoin,
} from "@/lib/morningOpening";
import { isMaterialsCycle } from "@/lib/educationLevels";
import { getSectionsPdfBlob, type PdfColumn, type PdfSection, type PdfSchoolInfo } from "@/lib/pdfExport";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_ORDER = [1, 2, 3, 4, 5];
const WEEKDAYS = MORNING_WEEKDAYS;

const SLOT_COLUMNS: PdfColumn[] = [
  { header: "Horaire", key: "horaire" },
  { header: "Matière", key: "matiere" },
  { header: "Professeur", key: "professeur" },
  { header: "Salle", key: "salle" },
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

const EXAM_COLUMNS: PdfColumn[] = [
  { header: "Date", key: "date" },
  { header: "Horaire", key: "horaire" },
  { header: "Matière", key: "matiere" },
  { header: "Période", key: "periode" },
];

const ACTIVITY_COLUMNS: PdfColumn[] = [
  { header: "Date", key: "date" },
  { header: "Horaire", key: "horaire" },
  { header: "Activité", key: "activite" },
  { header: "Objectif", key: "objectif" },
  { header: "Lieu", key: "lieu" },
  { header: "Parents", key: "parents" },
  { header: "Cotisation", key: "cotisation" },
  { header: "Date limite", key: "limite" },
  { header: "Tenue", key: "tenue" },
];

const MEETING_COLUMNS: PdfColumn[] = [
  { header: "Date", key: "date" },
  { header: "Heure", key: "heure" },
  { header: "Objectif", key: "objectif" },
  { header: "Lieu", key: "lieu" },
];

function placeLabel(kind?: string | null, text?: string | null, label?: string | null): string {
  if (label) return label;
  if (kind === "OTHER") return text?.trim() || "—";
  return "À l'école";
}

function handoverTitle(level?: string | null): string {
  return (level ?? "").toUpperCase() === "PRESCOLAIRE" ? "Remise des carnets" : "Remise des bulletins";
}

function vacationKindLabel(kind?: string | null): string {
  return kind === "CONGE" ? "Congé" : "Vacance";
}

function dateKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetchWithAuth(url);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.message as string) || "Erreur");
  return data;
}

function asList<T>(data: Record<string, unknown>, ...keys: string[]): T[] {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

type Slot = {
  class_id: string;
  class_name?: string;
  subject_name?: string;
  teacher_name?: string | null;
  room_name?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type Moment = {
  class_id: string;
  class_name?: string | null;
  kind: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label?: string | null;
};

type Exam = {
  class_id: string;
  subject_name: string;
  period: string;
  exam_date: string;
  start_time: string;
  end_time: string;
};

type ExamPeriod = {
  class_id: string;
  class_level?: string | null;
  period_name: string;
  start_date: string;
  end_date: string;
  report_date?: string | null;
};

type Activity = {
  class_id: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  occasion: string;
  objective?: string | null;
  location_kind?: string | null;
  location_text?: string | null;
  location_label?: string | null;
  parents_concerned?: boolean;
  participation_fee?: string | null;
  contribution_due_date?: string | null;
  dress_code?: string | null;
};

type Meeting = {
  class_id: string;
  meeting_date: string;
  start_time: string;
  objective: string;
  location_kind?: string | null;
  location_text?: string | null;
  location_label?: string | null;
};

type Vacation = {
  class_id?: string | null;
  start_date: string;
  end_date: string;
  motif: string;
  kind?: string | null;
};

function courseSections(slots: Slot[], moments: Moment[]): PdfSection[] {
  const sections: PdfSection[] = [];
  for (const day of DAY_ORDER) {
    const daySlots = slots.filter((s) => s.day_of_week === day);
    if (daySlots.length === 0) continue;
    const courseRows = daySlots.map((s) => ({
      horaire: `${s.start_time} - ${s.end_time}`,
      matiere: s.subject_name ?? "—",
      professeur: s.teacher_name ?? "—",
      salle: s.room_name ?? "—",
      _start: s.start_time,
    }));
    const momentRows = moments
      .filter((m) => m.day_of_week === day)
      .map((m) => ({
        horaire: `${m.start_time} - ${m.end_time}`,
        matiere: m.title,
        professeur: "—",
        salle: "—",
        _start: m.start_time,
      }));
    const rows = [...momentRows, ...courseRows]
      .sort((a, b) => a._start.localeCompare(b._start))
      .map(({ _start, ...row }) => row);
    sections.push({ title: DAYS[day], table: { columns: SLOT_COLUMNS, rows } });
  }
  return sections;
}

function listSections(
  classId: string,
  level: string | null | undefined,
  lists: Record<number, { subjectIds: string[]; materials: string[] }>,
  subjects: { id: string; name: string }[],
  moments: Moment[],
): PdfSection[] {
  const nameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;
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

export async function buildClassAgendaPdfBlob(params: {
  classId: string;
  className: string;
  classLevel?: string | null;
  school?: PdfSchoolInfo | null;
}): Promise<Blob> {
  const { classId, className, classLevel } = params;
  const ctx = await fetchJson(`${API_BASE}/school/current-context`).catch(() => ({}));
  const yearId = (ctx.current_academic_year_id as string) || "";
  const yearName = (ctx.current_academic_year_name as string) || "";

  const slotParams = new URLSearchParams({ class_id: classId });
  const yearParams = new URLSearchParams({ class_id: classId });
  if (yearName) {
    slotParams.set("academic_year", yearName);
    yearParams.set("academic_year", yearName);
  }
  if (yearId) yearParams.set("academic_year_id", yearId);

  const examParams = new URLSearchParams({ class_id: classId });
  if (yearId) examParams.set("academic_year_id", yearId);

  const vacParams = new URLSearchParams();
  if (yearId) vacParams.set("academic_year_id", yearId);

  const [
    slotsData,
    momentsData,
    examsData,
    examPeriodsData,
    activitiesData,
    meetingsData,
    vacationsData,
    dayListsData,
    subjectsData,
  ] = await Promise.all([
    fetchJson(`${API_BASE}/schedule-slots?${slotParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/schedule-moments?${yearParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/exam-schedules?${examParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/exam-periods?${examParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/extracurricular-activities?${examParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/parent-meetings?${examParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/school-vacations?${vacParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/class-day-lists?${slotParams}`).catch(() => ({})),
    fetchJson(`${API_BASE}/classes/${classId}/subjects`).catch(() => ({})),
  ]);

  const slots = asList<Slot>(slotsData, "schedule_slots").filter((s) => s.class_id === classId);
  const moments = asList<Moment>(momentsData, "schedule_moments").filter((m) => m.class_id === classId);
  const exams = asList<Exam>(examsData, "exam_schedules").filter((e) => e.class_id === classId);
  const examPeriods = asList<ExamPeriod>(examPeriodsData, "exam_periods").filter((p) => p.class_id === classId);
  const activities = asList<Activity>(activitiesData, "extracurricular_activities").filter(
    (a) => a.class_id === classId,
  );
  const meetings = asList<Meeting>(meetingsData, "parent_meetings").filter((m) => m.class_id === classId);
  const vacations = asList<Vacation>(vacationsData, "school_vacations").filter(
    (v) => !v.class_id || v.class_id === classId,
  );
  const subjects = asList<{ id: string; name: string }>(subjectsData, "subjects");
  const lists = classDayListsFromApi(
    asList<{ day_of_week: number; subject_ids?: string[]; materials?: string[] }>(dayListsData, "days"),
  );

  const sections: PdfSection[] = [];
  if (yearName) sections.push({ lines: [`Année scolaire : ${yearName}`] });

  if (isListScheduleLevel(classLevel)) {
    sections.push(...listSections(classId, classLevel, lists, subjects, moments));
  } else {
    const course = courseSections(slots, moments);
    if (course.length) {
      sections.push({ title: "Cours" }, ...course);
    }
  }

  if (examPeriods.length) {
    sections.push({
      title: "Périodes d'examens",
      table: {
        columns: [
          { header: "Période", key: "periode" },
          { header: "Du", key: "debut" },
          { header: "Au", key: "fin" },
          { header: "Remise", key: "remise" },
        ],
        rows: examPeriods.map((p) => ({
          periode: p.period_name,
          debut: formatDateJJMMAAAA(p.start_date),
          fin: formatDateJJMMAAAA(p.end_date),
          remise: p.report_date
            ? `${handoverTitle(p.class_level || classLevel)} : ${formatDateJJMMAAAA(p.report_date)}`
            : "—",
        })),
      },
    });
  }

  if (exams.length) {
    const rows = [...exams]
      .sort(
        (a, b) =>
          dateKey(a.exam_date).localeCompare(dateKey(b.exam_date)) ||
          a.start_time.localeCompare(b.start_time),
      )
      .map((e) => ({
        date: formatDateJJMMAAAA(e.exam_date),
        horaire: `${e.start_time} - ${e.end_time}`,
        matiere: e.subject_name,
        periode: e.period,
      }));
    sections.push({
      title: "Examens",
      table: { columns: EXAM_COLUMNS, rows },
    });
  }

  if (activities.length) {
    sections.push({
      title: "Activités parascolaires",
      table: {
        columns: ACTIVITY_COLUMNS,
        rows: [...activities]
          .sort(
            (a, b) =>
              a.activity_date.localeCompare(b.activity_date) || a.start_time.localeCompare(b.start_time),
          )
          .map((a) => ({
            date: formatDateJJMMAAAA(a.activity_date),
            horaire: `${a.start_time} - ${a.end_time}`,
            activite: a.occasion,
            objectif: a.objective || "—",
            lieu: placeLabel(a.location_kind, a.location_text, a.location_label),
            parents: a.parents_concerned ? "Oui" : "Non",
            cotisation: a.participation_fee ?? "—",
            limite: a.contribution_due_date ? formatDateJJMMAAAA(a.contribution_due_date) : "—",
            tenue: a.dress_code ?? "—",
          })),
      },
    });
  }

  if (meetings.length) {
    sections.push({
      title: "Réunions des parents",
      table: {
        columns: MEETING_COLUMNS,
        rows: [...meetings]
          .sort(
            (a, b) =>
              dateKey(a.meeting_date).localeCompare(dateKey(b.meeting_date)) ||
              a.start_time.localeCompare(b.start_time),
          )
          .map((m) => ({
            date: formatDateJJMMAAAA(m.meeting_date),
            heure: m.start_time,
            objectif: m.objective,
            lieu: placeLabel(m.location_kind, m.location_text, m.location_label),
          })),
      },
    });
  }

  if (vacations.length) {
    const lines = new Map<string, Vacation[]>();
    for (const v of vacations) {
      const key = [
        (v.start_date || "").slice(0, 10),
        (v.end_date || "").slice(0, 10),
        (v.motif || "").trim().toLowerCase(),
        v.kind === "CONGE" ? "CONGE" : "VACANCE",
      ].join("|");
      const list = lines.get(key) ?? [];
      list.push(v);
      lines.set(key, list);
    }
    sections.push({
      title: "Vacances et congés",
      table: {
        columns: [
          { header: "Type", key: "type" },
          { header: "Début", key: "debut" },
          { header: "Fin", key: "fin" },
          { header: "Motif", key: "motif" },
        ],
        rows: [...lines.values()].map((items) => ({
          type: vacationKindLabel(items[0].kind),
          debut: formatDateJJMMAAAA(items[0].start_date),
          fin: formatDateJJMMAAAA(items[0].end_date),
          motif: items[0].motif,
        })),
      },
    });
  }

  const hasContent = sections.some((s) => (s.table?.rows.length ?? 0) > 0);
  if (!hasContent) {
    throw new Error("Aucun agenda pour cette classe");
  }

  return getSectionsPdfBlob(sections, `Agenda — ${className}`, {
    school: params.school ?? undefined,
  });
}

export function agendaFilename(className: string): string {
  const slug = className
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `agenda-${slug || "classe"}`;
}
