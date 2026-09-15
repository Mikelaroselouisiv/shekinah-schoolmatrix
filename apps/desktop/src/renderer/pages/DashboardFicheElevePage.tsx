import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { API_BASE, fetchWithAuth, getImageUrl } from "@/services/api";
import { useSchoolProfile } from "@/context/SchoolProfileContext";
import { ROLES_FULL, canSeeStudentDossierComplet, canSeeStudentNisu } from "@/lib/dashboardRoles";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { ExportBadgePdfButton } from "@/components/ExportBadgePdfButton";
import { buildBadgesPdfBlob } from "@/lib/badgeProduction";
import { formatDateJJMMAAAA } from "@/lib/format";
import { formatPointsOnBareme, pointsToTen } from "@/lib/gradeScale";
import type { PdfSection } from "@/lib/pdfExport";
import { learnerNoun, learnerNounCap, isHigherEducationLevel, isMaterialsCycle } from "@/lib/educationLevels";
import { dutiesForStudent, dutyDisplayTitle, isListScheduleLevel, namesJoin } from "@/lib/morningOpening";
import {
  getStudentDossierPdfBlob,
  type StudentDossier,
  type StudentDossierYear,
} from "@/lib/studentDossierPdf";

type Student = {
  id: string;
  order_number: string | null;
  management_code: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  photo_identity_student: string | null;
  photo_identity_mother: string | null;
  photo_identity_father: string | null;
  photo_identity_responsible: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  father_name: string | null;
  father_phone: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  class_id: string;
  class_name: string;
  class_level?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  is_preschool?: boolean;
  active?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
  is_alumni?: boolean;
};

type ClassItem = { id: string; name: string; level?: string | null };

type AcademicYear = { id: string; name: string };

type DisciplineSummary = {
  student_id: string;
  student_name: string;
  class_name: string;
  disciplinary_points: number;
  lateness_count: number;
  absence_count: number;
  latest_measure: { id: string; label: string; color?: string; reason?: string; expires_at?: string } | null;
  points_history?: { date: string | null; points: number }[];
};

type PaymentByService = {
  service_id: string;
  service_name: string;
  amount_due: number;
  total_paid: number;
  balance: number;
  due_date?: string | null;
};

type PaymentStatus = {
  academic_year: string;
  by_service: PaymentByService[];
  transactions?: { amount_due: number; amount_paid: number; payment_date: string }[];
};

type GradeSubject = {
  subject_id: string;
  subject_name: string;
  periods: { period_id: string; period_name: string; order_index: number; coefficient: number; grade_value: number }[];
};

type ExamResults = {
  academic_year_id: string;
  academic_year_name: string | null;
  periods: { id: string; name: string; order_index: number }[];
  subjects: GradeSubject[];
};

type FormationStudent = {
  id: string;
  first_name: string;
  last_name: string;
  order_number: string | null;
  decision: string | null;
  average: number | null;
  assignment_id: string | null;
};

const DECISION_LABELS: Record<string, string> = {
  ADMIS: "Admis",
  ADMIS_AILLEURS: "Admis ailleurs",
  REDOUBLER: "Redoubler",
  AJOURNE: "Ajourné",
  RENVOYE: "Renvoyé",
  RENVOYE_DEFINITIVEMENT: "Renvoyé définitivement",
  EXPELLED: "Exclu",
};

type LinkedStudent = {
  id: string;
  order_number: string | null;
  management_code: string | null;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name: string;
};

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
/** Semaine de classe : lundi d'abord, dimanche en dernier. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type ScheduleSlot = {
  id: string;
  academic_year: string | null;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  teacher_id: number | null;
  teacher_name: string | null;
  room_id: string | null;
  room_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  materials?: string | null;
  kind?: string;
};

type ExamScheduleItem = {
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

function parseDayLists(raw: unknown): { day_of_week: number; subject_names: string[]; materials: string[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row: {
      day_of_week?: number;
      subject_names?: string[];
      materials?: string[];
    }) => ({
      day_of_week: Number(row.day_of_week),
      subject_names: Array.isArray(row.subject_names) ? row.subject_names.filter(Boolean) : [],
      materials: Array.isArray(row.materials) ? row.materials.filter(Boolean) : [],
    }))
    .filter((d) => d.day_of_week >= 1 && d.day_of_week <= 5);
}

function mergeClassSchedule(
  slots: ScheduleSlot[],
  moments: {
    id: string;
    class_name?: string | null;
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }[],
  duties: {
    id: string;
    title: string;
    kind?: string;
    cycle?: string | null;
    class_id?: string | null;
    class_name?: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    responsible_name?: string | null;
  }[],
  classId?: string | null,
  classLevel?: string | null,
): ScheduleSlot[] {
  const relevant = dutiesForStudent(duties, classId, classLevel);
  const extra: ScheduleSlot[] = [
    ...relevant.map((d) => ({
      id: `duty:${d.id}`,
      academic_year: null,
      class_id: d.class_id ?? "",
      class_name: d.class_name ?? "",
      subject_id: "",
      subject_name: dutyDisplayTitle(d),
      teacher_id: null,
      teacher_name: d.responsible_name ?? null,
      room_id: null,
      room_name: null,
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
      kind: d.kind ?? "RENTREE",
    })),
    ...moments.map((m) => ({
      id: `moment:${m.id}`,
      academic_year: null,
      class_id: "",
      class_name: m.class_name ?? "",
      subject_id: "",
      subject_name: m.title,
      teacher_id: null,
      teacher_name: null,
      room_id: null,
      room_name: null,
      day_of_week: m.day_of_week,
      start_time: m.start_time,
      end_time: m.end_time,
      kind: "MOMENT",
    })),
    ...(isListScheduleLevel(classLevel) ? [] : slots),
  ];
  return extra.sort(
    (a, b) =>
      a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}

type ExtracurricularActivityItem = {
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

export function DashboardFicheElevePage() {
  const [searchParams] = useSearchParams();
  const initialStudentId = searchParams.get("student_id") ?? "";
  const { roleName, school, rolePermissions } = useSchoolProfile() ?? {
    roleName: "",
    school: null,
    rolePermissions: [] as string[],
  };
  const canDossier = canSeeStudentDossierComplet(roleName, rolePermissions);
  const canSeeNisu = canSeeStudentNisu(roleName, rolePermissions);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<{ id: string; order_number: string | null; management_code: string | null; first_name: string; last_name: string; class_id: string }[]>([]);
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [restrictToLinkedStudents, setRestrictToLinkedStudents] = useState(false);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [discipline, setDiscipline] = useState<DisciplineSummary | null>(null);
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [examResults, setExamResults] = useState<ExamResults | null>(null);
  const [formationDecision, setFormationDecision] = useState<FormationStudent | null>(null);
  const [scheduleTab, setScheduleTab] = useState<"cours" | "examens" | "parascolaires">("cours");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [examSchedules, setExamSchedules] = useState<ExamScheduleItem[]>([]);
  const [extracurricularActivities, setExtracurricularActivities] = useState<ExtracurricularActivityItem[]>([]);
  const [dayLists, setDayLists] = useState<
    { day_of_week: number; subject_names: string[]; materials: string[] }[]
  >([]);
  const [homework, setHomework] = useState<
    {
      id: string;
      kind: string;
      title: string;
      instructions: string | null;
      due_date: string | null;
      subject_name: string | null;
      teacher_name: string | null;
      score: string | null;
      comment: string | null;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [rosterMode, setRosterMode] = useState<"active" | "alumni">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; order_number: string | null; management_code: string | null; first_name: string; last_name: string; class_name?: string | null; is_alumni?: boolean }[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dossierYears, setDossierYears] = useState<StudentDossierYear[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  const loadClasses = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setClasses(data.classes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [API_BASE]);

  const loadAcademicYears = useCallback(async () => {
    try {
      const [res, ctxRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/school/current-context`),
      ]);
      const data = await res.json();
      const ctxData = await ctxRes.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const years = data.academic_years ?? [];
      setAcademicYears(years);
      if (years.length > 0) {
        const defaultId = ctxRes.ok && ctxData.current_academic_year_id && years.some((y: { id: string }) => y.id === ctxData.current_academic_year_id)
          ? ctxData.current_academic_year_id
          : years[0].id;
        setSelectedYearId((prev) => (prev === "" ? defaultId : prev));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [API_BASE]);

  const loadStudents = useCallback(async (classId: string) => {
    if (!classId) {
      setStudents([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/students?class_id=${classId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setStudents(data.students ?? []);
    } catch (e) {
      setStudents([]);
    }
  }, [API_BASE]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const isParentOnly = roleName === "PARENT";
      const [_, __, linkedRes] = await Promise.all([
        loadClasses(),
        loadAcademicYears(),
        fetchWithAuth(`${API_BASE}/users/me/linked-students`),
      ]);
      if (linkedRes) {
        const linkedData = await linkedRes.json();
        const list: LinkedStudent[] = linkedData.linked_students ?? [];
        if (list.length > 0) {
          setLinkedStudents(list);
          if (isParentOnly) {
            setRestrictToLinkedStudents(true);
            setStudents(list.map((s: LinkedStudent) => ({ id: s.id, order_number: s.order_number ?? null, management_code: s.management_code ?? null, first_name: s.first_name, last_name: s.last_name, class_id: s.class_id })));
            const toSelect = initialStudentId && list.some((x) => x.id === initialStudentId) ? initialStudentId : list[0].id;
            const sel = list.find((x) => x.id === toSelect) ?? list[0];
            setSelectedStudentId(toSelect);
            setSelectedClassId(sel.class_id);
          }
        }
      }
      setLoading(false);
    }
    init();
  }, [loadClasses, loadAcademicYears, roleName]);

  useEffect(() => {
    if (restrictToLinkedStudents) return;
    if (rosterMode === "alumni") {
      setStudents([]);
      return;
    }
    loadStudents(selectedClassId);
  }, [selectedClassId, loadStudents, restrictToLinkedStudents, rosterMode]);

  useEffect(() => {
    if (restrictToLinkedStudents) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const status = rosterMode === "alumni" ? "alumni" : "active";
        const res = await fetchWithAuth(
          `${API_BASE}/students/search?q=${encodeURIComponent(q)}&status=${status}&limit=20`,
        );
        const data = await res.json();
        setSearchResults(res.ok ? (data.students ?? []) : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 320);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, rosterMode, restrictToLinkedStudents]);

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  const loadStudentData = useCallback(async (studentId: string) => {
    if (!studentId) {
      setStudent(null);
      setDiscipline(null);
      setPayment(null);
      setExamResults(null);
      setFormationDecision(null);
      setScheduleSlots([]);
      setExamSchedules([]);
      setExtracurricularActivities([]);
      setDossierYears([]);
      return;
    }
    setError("");
    const yearName = selectedYearId ? academicYears.find((y) => y.id === selectedYearId)?.name : undefined;
    const paymentUrl = yearName
      ? `${API_BASE}/economat/student-payment-status/${studentId}?academic_year=${encodeURIComponent(yearName)}`
      : `${API_BASE}/economat/student-payment-status/${studentId}`;
    try {
      const dossierReq = canDossier
        ? fetchWithAuth(`${API_BASE}/students/${studentId}/dossier`)
        : Promise.resolve(null);
      const [studentRes, disciplineRes, paymentRes, dossierRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/students/${studentId}`),
        fetchWithAuth(`${API_BASE}/discipline/student-summary/${studentId}`),
        fetchWithAuth(paymentUrl),
        dossierReq,
      ]);
      const studentData = await studentRes.json();
      const disciplineData = await disciplineRes.json();
      const paymentData = await paymentRes.json();

      if (!studentRes.ok) throw new Error(studentData.message || "Erreur élève");
      const sData = studentData.student;
      setStudent(sData);
      if (sData?.class_id && rosterMode !== "alumni") setSelectedClassId(sData.class_id);

      let years: StudentDossierYear[] = [];
      if (dossierRes) {
        const dossierData = await dossierRes.json();
        if (dossierRes.ok) years = dossierData.years ?? [];
      }
      setDossierYears(years);
      const yearClassId =
        years.find((y) => y.academic_year_id === selectedYearId)?.class_id || sData?.class_id;

      if (disciplineRes.ok) setDiscipline(disciplineData);
      else setDiscipline(null);

      if (paymentRes.ok) setPayment({ academic_year: paymentData.academic_year, by_service: paymentData.by_service ?? [], transactions: paymentData.transactions });
      else setPayment(null);

      if (yearClassId && selectedYearId) {
        const yearName = academicYears.find((y) => y.id === selectedYearId)?.name;
        const [examRes, formationRes, slotsRes, examSchedRes, activitiesRes, hwRes, momentsRes, dutiesRes, studentSchedRes] = await Promise.all([
          fetchWithAuth(`${API_BASE}/grades/student-exam-results?student_id=${studentId}&academic_year_id=${selectedYearId}`),
          fetchWithAuth(`${API_BASE}/formation-classe/students?academic_year_id=${selectedYearId}&class_id=${yearClassId}`),
          fetchWithAuth(`${API_BASE}/schedule-slots?class_id=${yearClassId}${yearName ? `&academic_year=${encodeURIComponent(yearName)}` : ""}`),
          fetchWithAuth(`${API_BASE}/exam-schedules?class_id=${yearClassId}`),
          fetchWithAuth(`${API_BASE}/extracurricular-activities?class_id=${yearClassId}&academic_year_id=${selectedYearId}`),
          fetchWithAuth(`${API_BASE}/homework/student/${studentId}`),
          fetchWithAuth(`${API_BASE}/schedule-moments?class_id=${yearClassId}${yearName ? `&academic_year=${encodeURIComponent(yearName)}` : ""}`),
          fetchWithAuth(`${API_BASE}/school-week-duties?${yearName ? `academic_year=${encodeURIComponent(yearName)}` : ""}`),
          fetchWithAuth(`${API_BASE}/schedule/student/${studentId}${yearName ? `?academic_year=${encodeURIComponent(yearName)}` : ""}`),
        ]);
        const examData = await examRes.json();
        const formationData = await formationRes.json();
        const slotsData = await slotsRes.json();
        const examSchedData = await examSchedRes.json();
        const activitiesData = await activitiesRes.json();
        const hwData = await hwRes.json();
        const momentsData = await momentsRes.json();
        const dutiesData = await dutiesRes.json();
        const studentSchedData = studentSchedRes.ok ? await studentSchedRes.json() : {};
        setDayLists(parseDayLists(studentSchedData.day_lists));
        if (examRes.ok && examData.periods) setExamResults(examData);
        else setExamResults(null);
        const formationList = formationData.students ?? [];
        const fs = formationList.find((f: FormationStudent) => f.id === studentId);
        setFormationDecision(fs ?? null);
        setScheduleSlots(
          mergeClassSchedule(
            slotsRes.ok ? (slotsData.schedule_slots ?? []) : [],
            momentsRes.ok ? (momentsData.schedule_moments ?? []) : [],
            dutiesRes.ok ? (dutiesData.school_week_duties ?? []) : [],
            yearClassId,
            sData?.class_level || classes.find((c) => c.id === yearClassId)?.level,
          ),
        );
        setExamSchedules(examSchedRes.ok ? (examSchedData.exam_schedules ?? []) : []);
        setExtracurricularActivities(activitiesRes.ok ? (activitiesData.extracurricular_activities ?? []) : []);
        setHomework(hwRes.ok ? (hwData.assignments ?? []) : []);
      } else {
        setExamResults(null);
        setFormationDecision(null);
        if (yearClassId) {
          const [slotsRes, examSchedRes, activitiesRes, hwRes, momentsRes, dutiesRes, studentSchedRes] = await Promise.all([
            fetchWithAuth(`${API_BASE}/schedule-slots?class_id=${yearClassId}`),
            fetchWithAuth(`${API_BASE}/exam-schedules?class_id=${yearClassId}`),
            fetchWithAuth(`${API_BASE}/extracurricular-activities?class_id=${yearClassId}`),
            fetchWithAuth(`${API_BASE}/homework/student/${studentId}`),
            fetchWithAuth(`${API_BASE}/schedule-moments?class_id=${yearClassId}`),
            fetchWithAuth(`${API_BASE}/school-week-duties`),
            fetchWithAuth(`${API_BASE}/schedule/student/${studentId}`),
          ]);
          const slotsData = await slotsRes.json();
          const examSchedData = await examSchedRes.json();
          const activitiesData = await activitiesRes.json();
          const hwData = await hwRes.json();
          const momentsData = await momentsRes.json();
          const dutiesData = await dutiesRes.json();
          const studentSchedData = studentSchedRes.ok ? await studentSchedRes.json() : {};
          setDayLists(parseDayLists(studentSchedData.day_lists));
          setScheduleSlots(
            mergeClassSchedule(
              slotsRes.ok ? (slotsData.schedule_slots ?? []) : [],
              momentsRes.ok ? (momentsData.schedule_moments ?? []) : [],
              dutiesRes.ok ? (dutiesData.school_week_duties ?? []) : [],
              yearClassId,
              sData?.class_level || classes.find((c) => c.id === yearClassId)?.level,
            ),
          );
          setExamSchedules(examSchedRes.ok ? (examSchedData.exam_schedules ?? []) : []);
          setExtracurricularActivities(activitiesRes.ok ? (activitiesData.extracurricular_activities ?? []) : []);
          setHomework(hwRes.ok ? (hwData.assignments ?? []) : []);
        } else {
          setScheduleSlots([]);
          setExamSchedules([]);
          setExtracurricularActivities([]);
          setDayLists([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setStudent(null);
      setDiscipline(null);
      setPayment(null);
      setExamResults(null);
      setFormationDecision(null);
      setScheduleSlots([]);
      setExamSchedules([]);
      setExtracurricularActivities([]);
      setDayLists([]);
      setDossierYears([]);
    }
  }, [API_BASE, selectedYearId, academicYears, canDossier, rosterMode]);

  useEffect(() => {
    loadStudentData(selectedStudentId);
  }, [selectedStudentId, loadStudentData]);

  const handleYearChange = (yearId: string) => {
    setSelectedYearId(yearId);
    if (!selectedStudentId) return;
    const yearClassId =
      dossierYears.find((y) => y.academic_year_id === yearId)?.class_id || student?.class_id;
    if (yearClassId) {
      Promise.all([
        fetchWithAuth(`${API_BASE}/grades/student-exam-results?student_id=${selectedStudentId}&academic_year_id=${yearId}`),
        fetchWithAuth(`${API_BASE}/formation-classe/students?academic_year_id=${yearId}&class_id=${yearClassId}`),
      ]).then(async ([examRes, formationRes]) => {
        const examData = await examRes.json();
        const formationData = await formationRes.json();
        if (examRes.ok && examData.periods) setExamResults(examData);
        else setExamResults(null);
        const fs = (formationData.students ?? []).find((f: FormationStudent) => f.id === selectedStudentId);
        setFormationDecision(fs ?? null);
      });
    }
    const yearName = academicYears.find((y) => y.id === yearId)?.name;
    const yearEntry = dossierYears.find((y) => y.academic_year_id === yearId);
    if (yearName) {
      const payUrl = yearEntry?.class_id
        ? `${API_BASE}/economat/student-payment-status/${selectedStudentId}?academic_year=${encodeURIComponent(yearName)}&class_id=${yearEntry.class_id}`
        : `${API_BASE}/economat/student-payment-status/${selectedStudentId}?academic_year=${encodeURIComponent(yearName)}`;
      fetchWithAuth(payUrl)
        .then((r) => r.json())
        .then((d) => setPayment({ academic_year: d.academic_year ?? yearName, by_service: d.by_service ?? [], transactions: d.transactions }));
    }
  };

  const schedulePdfSections = useMemo<PdfSection[]>(() => {
    const sections: PdfSection[] = [];
    for (const day of DAY_ORDER) {
      const rows = scheduleSlots
        .filter((s) => s.day_of_week === day)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((s) => ({
          horaire: `${s.start_time} - ${s.end_time}`,
          matiere: s.subject_name,
          professeur: s.teacher_name ?? "—",
          salle: s.room_name ?? "—",
          materiel: s.materials?.trim() ? s.materials.replace(/\n/g, ", ") : "—",
        }));
      if (rows.length === 0) continue;
      sections.push({
        title: DAYS[day],
        table: {
          columns: [
            { header: "Horaire", key: "horaire" },
            { header: "Matière", key: "matiere" },
            { header: "Professeur", key: "professeur" },
            { header: "Salle", key: "salle" },
            { header: "Matériel", key: "materiel" },
          ],
          rows,
        },
      });
    }
    if (examSchedules.length > 0) {
      sections.push({
        title: "Horaire des examens",
        table: {
          columns: [
            { header: "Date", key: "date" },
            { header: "Horaire", key: "horaire" },
            { header: "Matière", key: "matiere" },
            { header: "Période", key: "periode" },
          ],
          rows: [...examSchedules]
            .sort(
              (a, b) =>
                a.exam_date.localeCompare(b.exam_date) ||
                a.start_time.localeCompare(b.start_time),
            )
            .map((e) => ({
              date: formatDateJJMMAAAA(e.exam_date),
              horaire: `${e.start_time} - ${e.end_time}`,
              matiere: e.subject_name,
              periode: e.period,
            })),
        },
      });
    }
    if (extracurricularActivities.length > 0) {
      sections.push({
        title: "Activités parascolaires",
        table: {
          columns: [
            { header: "Date", key: "date" },
            { header: "Horaire", key: "horaire" },
            { header: "Occasion", key: "occasion" },
            { header: "Frais", key: "frais" },
            { header: "Tenue", key: "tenue" },
          ],
          rows: [...extracurricularActivities]
            .sort((a, b) => a.activity_date.localeCompare(b.activity_date))
            .map((a) => ({
              date: formatDateJJMMAAAA(a.activity_date),
              horaire: `${a.start_time} - ${a.end_time}`,
              occasion: a.occasion,
              frais: a.participation_fee ?? "—",
              tenue: a.dress_code ?? "—",
            })),
        },
      });
    }
    if (dayLists.some((d) => d.subject_names.length || d.materials.length)) {
      const withMat = isMaterialsCycle(student?.class_level);
      sections.unshift({
        title: withMat ? "Matières et matériel" : "Emploi du temps",
        table: {
          columns: withMat
            ? [
                { header: "Jour", key: "jour" },
                { header: "Matières", key: "matieres" },
                { header: "Matériel à apporter", key: "materiel" },
              ]
            : [
                { header: "Jour", key: "jour" },
                { header: "Matières", key: "matieres" },
              ],
          rows: [1, 2, 3, 4, 5].map((day) => {
            const slot = dayLists.find((d) => d.day_of_week === day);
            return {
              jour: DAYS[day],
              matieres: namesJoin(slot?.subject_names ?? []),
              materiel: namesJoin(slot?.materials ?? []),
            };
          }),
        },
      });
    }
    return sections;
  }, [scheduleSlots, examSchedules, extracurricularActivities, dayLists, student?.class_level]);

  const ficheLevel =
    student?.class_level || classes.find((c) => c.id === selectedClassId)?.level;
  const ficheLearner = learnerNoun(ficheLevel);

  if (loading) {
    return <div className="animate-pulse text-slate-500 p-8">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Fiche {ficheLearner}</h2>

      {/* Sélecteur élève */}
      <div className="flex flex-wrap gap-4 items-end p-4 rounded-xl border border-[var(--app-border)] bg-white">
        {canDossier && !restrictToLinkedStudents && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registre</label>
            <select
              value={rosterMode}
              onChange={(e) => {
                const mode = e.target.value as "active" | "alumni";
                setRosterMode(mode);
                setSearchQuery("");
                setSearchResults([]);
                setSelectedStudentId("");
                setStudents([]);
              }}
              className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[180px]"
            >
              <option value="active">Élèves en cours</option>
              <option value="alumni">Anciens élèves</option>
            </select>
          </div>
        )}
        {!restrictToLinkedStudents && rosterMode === "active" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudentId("");
              }}
              className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[180px]"
            >
              <option value="">— Sélectionner —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {!restrictToLinkedStudents && (
          <div className="relative min-w-[260px] flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Rechercher {rosterMode === "alumni" ? "un ancien élève" : `un ${ficheLearner}`}
            </label>
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setSearchOpen(false), 180);
              }}
              placeholder={canSeeNisu ? "Nom, prénom, NISU ou code" : "Nom, prénom ou code (2 caractères min.)"}
              className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
            />
            {searchOpen && searchQuery.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-[var(--app-border)] bg-white shadow-lg">
                {searchLoading ? (
                  <p className="px-3 py-2 text-sm text-slate-500">Recherche...</p>
                ) : searchResults.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">Aucun dossier trouvé.</p>
                ) : (
                  searchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setSelectedStudentId(s.id);
                        setSearchQuery(`${s.last_name} ${s.first_name}`);
                        setSearchResults([]);
                        setSearchOpen(false);
                      }}
                    >
                      <span className="font-medium">{s.last_name} {s.first_name}</span>
                      {canSeeNisu && s.order_number ? <span className="text-slate-500"> · NISU {s.order_number}</span> : null}
                      {s.management_code ? <span className="text-slate-500"> · {s.management_code}</span> : null}
                      {s.class_name ? <span className="text-slate-400"> · {s.class_name}</span> : null}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        {(restrictToLinkedStudents || (rosterMode === "active" && selectedClassId)) && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{learnerNounCap(ficheLevel)}</label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedStudentId(id);
                if (restrictToLinkedStudents) {
                  const s = linkedStudents.find((x) => x.id === id);
                  if (s) setSelectedClassId(s.class_id);
                }
              }}
              className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[220px]"
            >
              <option value="">— Sélectionner —</option>
              {(restrictToLinkedStudents ? linkedStudents : students).map((s) => (
                <option key={s.id} value={s.id}>
                  {canSeeNisu && "order_number" in s && s.order_number
                    ? `${s.order_number} — `
                    : s.management_code
                      ? `${s.management_code} — `
                      : ""}
                  {s.first_name} {s.last_name}
                  {restrictToLinkedStudents && "class_name" in s ? ` (${(s as LinkedStudent).class_name})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {!student ? (
        <div className="p-12 rounded-xl border border-[var(--app-border)] bg-slate-50/50 text-center text-slate-500">
          Sélectionnez ou recherchez un {ficheLearner} pour afficher son dossier.
        </div>
      ) : (
        <>
          {/* En-tête : photo enfant, nom, téléphone */}
          <div className="flex flex-wrap gap-6 p-6 rounded-xl border border-[var(--app-border)] bg-white items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 border border-[var(--app-border)] flex-shrink-0">
                {getImageUrl(student.photo_identity_student) ? (
                  <img src={getImageUrl(student.photo_identity_student)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-slate-400">👤</div>
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {student.first_name} {student.last_name}
                </h3>
                <p className="text-slate-600 font-mono text-sm">
                  Code {student.management_code ?? "—"}
                </p>
                {canSeeNisu && student.order_number && !isHigherEducationLevel(student.class_level) ? (
                  <p className="text-slate-600 font-mono text-sm">
                    NISU {student.order_number}
                  </p>
                ) : null}
                <p className="text-slate-700 mt-1">
                  <span className="font-medium">Tél. :</span> {student.phone ?? student.email ?? "—"}
                </p>
                <p className="text-slate-500 text-sm">
                  {student.class_name}
                  {student.room_name ? ` · Salle ${student.room_name}` : ""}
                </p>
                {student.is_alumni && (
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    Ancien élève
                    {student.archive_reason === "GRADUATED"
                      ? " — fin de cycle"
                      : student.archive_reason === "REMOVED"
                        ? " — retiré de l’année"
                        : ""}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canDossier && (
                <ExportPdfButton
                  label="Dossier scolaire (PDF)"
                  filename={`dossier-${student.last_name}-${student.first_name}`}
                  getBlob={async () => {
                    const res = await fetchWithAuth(`${API_BASE}/students/${student.id}/dossier`);
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || "Impossible de charger le dossier");
                    return getStudentDossierPdfBlob(data as StudentDossier);
                  }}
                />
              )}
              <ExportBadgePdfButton
                label="Produire le badge"
                filename={`badge-${student.first_name}-${student.last_name}`}
                getBlob={async () => {
                  return buildBadgesPdfBlob({
                    school,
                    students: [
                      {
                        first_name: student.first_name,
                        last_name: student.last_name,
                        management_code: student.management_code,
                        class_name: student.class_name,
                        room_name: student.room_name ?? null,
                        photo_url: student.photo_identity_student,
                      },
                    ],
                  });
                }}
              />
              {ROLES_FULL.includes(roleName) && (
                <Link
                  to={`/dashboard/students?edit_id=${student.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--school-accent-1)] text-[var(--school-accent-1)] hover:bg-[var(--school-accent-1)]/10 font-medium text-sm transition-colors"
                >
                  Modifier l&apos;{ficheLearner}
                </Link>
              )}
            </div>
          </div>

          {canDossier && dossierYears.length > 0 && (
            <div className="rounded-xl border border-[var(--app-border)] bg-white overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-[var(--app-border)] font-semibold text-slate-900">
                Parcours scolaire
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {dossierYears.map((y) => {
                  const active = y.academic_year_id === selectedYearId;
                  return (
                    <button
                      key={y.academic_year_id}
                      type="button"
                      onClick={() => handleYearChange(y.academic_year_id)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${
                        active
                          ? "border-[var(--school-accent-1)] bg-[var(--school-accent-1)]/10"
                          : "border-[var(--app-border)] bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-medium text-slate-900">{y.academic_year_name}</div>
                      <div className="text-xs text-slate-500">
                        {y.class_name ?? "—"}
                        {y.average != null ? ` · moy. ${y.average.toFixed(2)}` : ""}
                        {y.decision ? ` · ${DECISION_LABELS[y.decision] ?? y.decision}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Parents : minimal (photo, nom, tél) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Mère", name: student.mother_name, phone: student.mother_phone, photo: student.photo_identity_mother },
              { label: "Père", name: student.father_name, phone: student.father_phone, photo: student.photo_identity_father },
              { label: "Responsable", name: student.responsible_name, phone: student.responsible_phone, photo: student.photo_identity_responsible },
            ].map((p) => (
              <div key={p.label} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--app-border)] bg-slate-50/50">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0">
                  {getImageUrl(p.photo) ? (
                    <img src={getImageUrl(p.photo)!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg text-slate-400">👤</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-medium">{p.label}</p>
                  <p className="font-medium text-slate-900 truncate">{p.name ?? "—"}</p>
                  <p className="text-sm text-slate-600 truncate">{p.phone ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Blocs moniteurs : Discipline + Paiement */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Situation disciplinaire */}
            <div className="rounded-xl border border-[var(--app-border)] bg-white overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-[var(--app-border)] font-semibold text-slate-900">
                Situation disciplinaire
              </div>
              <div className="p-4">
                {discipline ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-3xl font-bold text-slate-900">{discipline.disciplinary_points}</div>
                      <span className="text-slate-600">/ 100 points</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 rounded-full overflow-hidden bg-slate-200">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(0, discipline.disciplinary_points))}%`,
                            backgroundColor:
                              discipline.disciplinary_points >= 80 ? "#22c55e" :
                              discipline.disciplinary_points >= 60 ? "#eab308" :
                              discipline.disciplinary_points >= 40 ? "#f97316" :
                              "#ef4444",
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        {discipline.disciplinary_points >= 80 && "Très bien"}
                        {discipline.disciplinary_points >= 60 && discipline.disciplinary_points < 80 && "Correct"}
                        {discipline.disciplinary_points >= 40 && discipline.disciplinary_points < 60 && "Attention"}
                        {discipline.disciplinary_points < 40 && "Critique"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="text-slate-600">Retards : <strong>{discipline.lateness_count}</strong></span>
                      <span className="text-slate-600">Absences : <strong>{discipline.absence_count}</strong></span>
                    </div>
                    {discipline.latest_measure && (
                      <div
                        className="inline-block px-3 py-1.5 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: discipline.latest_measure.color ? `${discipline.latest_measure.color}20` : "rgb(241 245 249)", color: discipline.latest_measure.color ?? "#64748b" }}
                      >
                        {discipline.latest_measure.label}
                        {discipline.latest_measure.reason && ` — ${discipline.latest_measure.reason}`}
                        {discipline.latest_measure.expires_at && (
                          <span className="ml-1">
                            (jusqu'au {formatDateJJMMAAAA(discipline.latest_measure.expires_at)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Aucune donnée disciplinaire.</p>
                )}
              </div>
            </div>

            {/* Situation de paiement */}
            <div className="rounded-xl border border-[var(--app-border)] bg-white overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-[var(--app-border)] font-semibold text-slate-900 flex items-center justify-between flex-wrap gap-2">
                <span>Situation de paiement</span>
                <div className="flex items-center gap-2">
                {payment && payment.by_service?.length > 0 && (
                  <ExportPdfButton
                    table={{
                      title: `Situation de paiement — ${student.first_name} ${student.last_name}`,
                      subtitle: payment.academic_year,
                      columns: [
                        { header: "Service", key: "service_name" },
                        { header: "Échéance", key: "due_date" },
                        { header: "Montant", key: "amount_due" },
                        { header: "Versement", key: "total_paid" },
                        { header: "Balance", key: "balance" },
                      ],
                      rows: payment.by_service.map((svc) => ({
                        service_name: svc.service_name,
                        due_date: svc.due_date ? formatDateJJMMAAAA(svc.due_date) : "—",
                        amount_due: String(svc.amount_due),
                        total_paid: String(svc.total_paid),
                        balance: String(svc.balance),
                      })),
                    }}
                    filename={`paiement-${student.first_name}-${student.last_name}-${payment.academic_year}.pdf`}
                    label="Exporter en PDF"
                    className="text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  />
                )}
                {academicYears.length > 0 && (
                  <select
                    value={selectedYearId || academicYears[0]?.id}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className="text-sm border border-[var(--app-border)] rounded px-2 py-1"
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                )}
                </div>
              </div>
              <div className="p-4">
                {payment && payment.by_service?.length > 0 ? (
                  <div className="space-y-3">
                    {payment.by_service.map((svc) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const dueDate = svc.due_date ? new Date(svc.due_date) : null;
                      if (dueDate) dueDate.setHours(0, 0, 0, 0);
                      const isPaid = svc.balance <= 0;
                      const isOverdue = !isPaid && dueDate && dueDate < today;
                      const isDueSoon = !isPaid && dueDate && dueDate >= today && (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) <= 14;
                      const statusBg = isPaid ? "bg-emerald-50 border-emerald-200" : isOverdue ? "bg-red-50 border-red-200" : isDueSoon ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200";
                      const statusLabel = isPaid ? "Payé" : isOverdue ? "En retard" : isDueSoon ? "À payer bientôt" : "À payer";
                      const statusColor = isPaid ? "text-emerald-700" : isOverdue ? "text-red-700" : isDueSoon ? "text-amber-700" : "text-slate-700";
                      return (
                        <div key={svc.service_id} className={`flex flex-wrap justify-between items-center text-sm p-3 rounded-lg border ${statusBg}`}>
                          <div>
                            <span className="font-medium text-slate-900">{svc.service_name}</span>
                            <p className={`text-xs mt-0.5 ${statusColor}`}>
                              <span className="font-semibold">{statusLabel}</span>
                              {svc.due_date && (
                                <>
                                  <br />
                                  Délaie : {formatDateJJMMAAAA(svc.due_date)}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="text-right mt-1 sm:mt-0 text-sm">
                            <div className="text-slate-700">Montant : {svc.amount_due.toLocaleString("fr-FR")}</div>
                            <div className="mt-1 text-slate-600">
                              Versement : {svc.total_paid.toLocaleString("fr-FR")}
                              <span className="mx-2 text-slate-400">|</span>
                              <span className={svc.balance > 0 ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>
                                Balance : {svc.balance.toLocaleString("fr-FR")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Aucune donnée de paiement pour cette année.</p>
                )}
              </div>
            </div>
          </div>

          {/* Emploi du temps : cours, examens, activités parascolaires */}
          <div className="rounded-xl border border-[var(--app-border)] bg-white overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-[var(--app-border)] font-semibold text-slate-900 flex flex-wrap items-center justify-between gap-2">
              <span>Emploi du temps</span>
              <div className="flex items-center gap-2">
                <ExportPdfButton
                  sections={schedulePdfSections}
                  mainTitle={`Emploi du temps — ${student.first_name} ${student.last_name}${student.class_name ? ` (${student.class_name})` : ""}`}
                  filename={`emploi-du-temps-${student.first_name}-${student.last_name}`}
                  label="Exporter en PDF"
                  className="text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={schedulePdfSections.length === 0}
                />
                {academicYears.length > 0 && (
                  <select
                    value={selectedYearId || academicYears[0]?.id}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className="text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="p-4">
              <div className="flex gap-1 border-b border-[var(--app-border)] mb-4">
                {(["cours", "examens", "parascolaires"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setScheduleTab(t)}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                      scheduleTab === t
                        ? "bg-white border border-[var(--app-border)] border-b-0 text-slate-900 -mb-px"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    {t === "cours" && "Horaire des cours"}
                    {t === "examens" && "Horaire des examens"}
                    {t === "parascolaires" && "Activités parascolaires"}
                  </button>
                ))}
              </div>
              {scheduleTab === "cours" && (
                <div className="space-y-4">
                  {dayLists.some((d) => d.subject_names.length || d.materials.length) ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                          <tr>
                            <th className="px-4 py-2 font-medium text-slate-900">Jour</th>
                            <th className="px-4 py-2 font-medium text-slate-900">Matières</th>
                            {isMaterialsCycle(ficheLevel) ? (
                              <th className="px-4 py-2 font-medium text-slate-900">Matériel à apporter</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {[1, 2, 3, 4, 5].map((day) => {
                            const slot = dayLists.find((d) => d.day_of_week === day);
                            return (
                              <tr key={day} className="border-b border-[var(--app-border)]">
                                <td className="px-4 py-2 text-slate-700">{DAYS[day]}</td>
                                <td className="px-4 py-2 text-slate-800">
                                  {namesJoin(slot?.subject_names ?? [])}
                                </td>
                                {isMaterialsCycle(ficheLevel) ? (
                                <td className="px-4 py-2 text-slate-800">
                                  {namesJoin(slot?.materials ?? [])}
                                </td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                      <tr>
                        <th className="px-4 py-2 font-medium text-slate-900">Jour</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Horaire</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Matière</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Professeur</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Salle</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Matériel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleSlots.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Aucun créneau de cours pour cette classe.</td></tr>
                      ) : (
                        scheduleSlots.map((s) => (
                          <tr key={s.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                            <td className="px-4 py-2 text-slate-700">{DAYS[s.day_of_week] ?? s.day_of_week}</td>
                            <td className="px-4 py-2 text-slate-600">{s.start_time} – {s.end_time}</td>
                            <td className="px-4 py-2 font-medium text-slate-900">{s.subject_name}</td>
                            <td className="px-4 py-2 text-slate-700">{s.teacher_name ?? "—"}</td>
                            <td className="px-4 py-2 text-slate-600">{s.room_name ?? "—"}</td>
                            <td className="px-4 py-2 text-slate-600 whitespace-pre-wrap">{s.materials?.trim() || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
              {scheduleTab === "examens" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                      <tr>
                        <th className="px-4 py-2 font-medium text-slate-900">Date</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Horaire</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Matière</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Période</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examSchedules.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Aucun examen planifié pour cette classe.</td></tr>
                      ) : (
                        examSchedules.map((e) => (
                          <tr key={e.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                            <td className="px-4 py-2 text-slate-600">{formatDateJJMMAAAA(e.exam_date)}</td>
                            <td className="px-4 py-2 text-slate-600">{e.start_time} – {e.end_time}</td>
                            <td className="px-4 py-2 font-medium text-slate-900">{e.subject_name}</td>
                            <td className="px-4 py-2 text-slate-600">{e.period}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {scheduleTab === "parascolaires" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                      <tr>
                        <th className="px-4 py-2 font-medium text-slate-900">Date</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Horaire</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Occasion</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Frais</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Tenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extracurricularActivities.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Aucune activité parascolaire pour cette classe.</td></tr>
                      ) : (
                        extracurricularActivities.map((a) => (
                          <tr key={a.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                            <td className="px-4 py-2 text-slate-600">{formatDateJJMMAAAA(a.activity_date)}</td>
                            <td className="px-4 py-2 text-slate-600">{a.start_time} – {a.end_time}</td>
                            <td className="px-4 py-2 font-medium text-slate-900">{a.occasion}</td>
                            <td className="px-4 py-2 text-slate-600">{a.participation_fee ?? "—"}</td>
                            <td className="px-4 py-2 text-slate-600">{a.dress_code ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--app-border)] bg-white overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-[var(--app-border)] font-semibold text-slate-900">
              Devoirs et leçons
            </div>
            <div className="p-4 overflow-x-auto">
              {homework.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun travail publié pour cette classe.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                    <tr>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Titre</th>
                      <th className="px-4 py-2 font-medium">Matière</th>
                      <th className="px-4 py-2 font-medium">Pour le</th>
                      <th className="px-4 py-2 font-medium">Note</th>
                      <th className="px-4 py-2 font-medium">Commentaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {homework.map((h) => (
                      <tr key={h.id} className="border-b border-[var(--app-border)]">
                        <td className="px-4 py-2">{h.kind === "DEVOIR" ? "Devoir" : "Leçon"}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">
                          {h.title}
                          {h.instructions ? (
                            <div className="text-slate-500 font-normal whitespace-pre-wrap mt-1">{h.instructions}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">{h.subject_name ?? "—"}</td>
                        <td className="px-4 py-2">{h.due_date ?? "—"}</td>
                        <td className="px-4 py-2">{h.score ?? "—"}</td>
                        <td className="px-4 py-2">{h.comment ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Carnet de notes : périodes, matières, moyennes, décisions */}
          <div className="rounded-xl border border-[var(--app-border)] bg-white overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-[var(--app-border)] font-semibold text-slate-900 flex flex-wrap items-center justify-between gap-3">
              <span>Carnet de notes</span>
              <div className="flex items-center gap-2">
              {examResults && examResults.subjects?.length > 0 && examResults.periods && (
                <ExportPdfButton
                  sections={[
                    {
                      title: "Carnet de notes (points / note sur, moy. sur 10)",
                      table: {
                        columns: [
                          { header: "Matière", key: "subject_name" },
                          ...(examResults.periods.map((p, i) => ({ header: p.name, key: `period_${i}` }))),
                          { header: "Moy. mat. /10", key: "moy_mat" },
                        ],
                        rows: [
                          ...examResults.subjects.map((subj) => {
                            const grades = subj.periods || [];
                            const totalPoints = grades.reduce((s, g) => s + (g.grade_value ?? 0), 0);
                            const totalCoef = grades.reduce((s, g) => s + g.coefficient, 0);
                            const moyMat = totalCoef > 0 ? Math.round((totalPoints / totalCoef) * 10 * 100) / 100 : null;
                            const row: Record<string, string | number> = {
                              subject_name: subj.subject_name,
                              moy_mat: moyMat != null ? moyMat.toFixed(2) : "—",
                            };
                            examResults.periods?.forEach((p, i) => {
                              const g = grades.find((gr) => gr.period_id === p.id);
                              const pts = g?.grade_value != null ? Number(g.grade_value) : null;
                              const coef = g?.coefficient != null ? Number(g.coefficient) : null;
                              row[`period_${i}`] = pts != null && coef != null ? formatPointsOnBareme(pts, coef) : "—";
                            });
                            return row;
                          }),
                          ...(examResults.periods?.length
                            ? (() => {
                                const periodSums = examResults.periods.map((p) => {
                                  let obtained = 0, possible = 0;
                                  examResults.subjects?.forEach((subj) => {
                                    const g = (subj.periods || []).find((gr) => gr.period_id === p.id);
                                    if (g) {
                                      obtained += Number(g.grade_value) || 0;
                                      possible += Number(g.coefficient) || 0;
                                    }
                                  });
                                  return { obtained, possible };
                                });
                                const periodAvgs = periodSums.map(({ obtained, possible }) =>
                                  possible > 0 ? (obtained / possible) * 10 : null,
                                );
                                const sumRow: Record<string, string | number> = {
                                  subject_name: "Somme points",
                                  moy_mat: "—",
                                };
                                examResults.periods?.forEach((p, i) => {
                                  sumRow[`period_${i}`] =
                                    periodSums[i].possible > 0 ? `${periodSums[i].obtained}/${periodSums[i].possible}` : "—";
                                });
                                const avgRow: Record<string, string | number> = {
                                  subject_name: "Moy. période /10",
                                  moy_mat: "—",
                                };
                                periodAvgs.forEach((avg, i) => {
                                  avgRow[`period_${i}`] = avg != null ? avg.toFixed(2) : "—";
                                });
                                return [sumRow, avgRow];
                              })()
                            : []),
                        ],
                      },
                    },
                    ...(formationDecision?.average != null || formationDecision?.decision
                      ? [
                          {
                            title: "Résultat",
                            lines: [
                              ...(formationDecision?.average != null
                                ? [`Moyenne générale /10 : ${Number(formationDecision.average).toFixed(2)}`]
                                : []),
                              ...(formationDecision?.decision
                                ? [`Décision : ${DECISION_LABELS[formationDecision.decision] ?? formationDecision.decision}`]
                                : []),
                            ],
                          },
                        ]
                      : []),
                  ]}
                  mainTitle={`Carnet de notes — ${student.first_name} ${student.last_name} (${examResults.academic_year_name ?? ""})`}
                  filename={`notes-${student.first_name}-${student.last_name}-${examResults.academic_year_name ?? "annee"}.pdf`}
                  label="Exporter en PDF"
                  className="text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                />
              )}
              <select
                value={selectedYearId || academicYears[0]?.id}
                onChange={(e) => handleYearChange(e.target.value)}
                className="text-sm border border-[var(--app-border)] rounded-lg px-3 py-2"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
              </div>
            </div>
            <div className="p-4 overflow-auto max-h-[70vh]">
              {examResults && examResults.subjects?.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 mb-2">Ex. 180/200 = 9,00/10 · barème 100, 200, 300, 400 ou 500.</p>
                  <table className="w-full text-sm border-collapse min-w-[600px]">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-2 font-medium text-slate-700 border-b border-[var(--app-border)]">Matière</th>
                        {examResults.periods?.map((p) => (
                          <th key={p.id} className="py-2 px-2 font-medium text-slate-700 border-b border-[var(--app-border)] text-center">
                            {p.name}
                          </th>
                        ))}
                        <th className="py-2 px-2 font-medium text-slate-700 border-b border-[var(--app-border)] text-center">Moy. mat. /10</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examResults.subjects.map((subj) => {
                        const grades = subj.periods || [];
                        const totalPoints = grades.reduce((s, g) => s + (g.grade_value ?? 0), 0);
                        const totalCoef = grades.reduce((s, g) => s + g.coefficient, 0);
                        const moyMat = totalCoef > 0 ? Math.round((totalPoints / totalCoef) * 10 * 100) / 100 : null;
                        return (
                          <tr key={subj.subject_id} className="border-b border-[var(--app-border)] last:border-b-0">
                            <td className="py-2 px-2 font-medium text-slate-900">{subj.subject_name}</td>
                            {examResults.periods?.map((p) => {
                              const g = grades.find((gr) => gr.period_id === p.id);
                              const pts = g?.grade_value != null ? Number(g.grade_value) : null;
                              const coef = g?.coefficient != null ? Number(g.coefficient) : null;
                              return (
                                <td key={p.id} className="py-2 px-2 text-center">
                                  {pts != null && coef != null ? (
                                    <span>
                                      {pts}/{coef}
                                      <span className="block text-[11px] text-slate-500">
                                        {pointsToTen(pts, coef) != null ? `${pointsToTen(pts, coef)!.toFixed(2)}/10` : ""}
                                      </span>
                                    </span>
                                  ) : "—"}
                                </td>
                              );
                            })}
                            <td className="py-2 px-2 text-center font-medium">
                              {moyMat != null ? moyMat.toFixed(2) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {examResults.periods && examResults.periods.length > 0 && (() => {
                        const periodSums = examResults.periods.map((p) => {
                          let obtained = 0, possible = 0;
                          examResults.subjects?.forEach((subj) => {
                            const g = (subj.periods || []).find((gr) => gr.period_id === p.id);
                            if (g) {
                              obtained += Number(g.grade_value) || 0;
                              possible += Number(g.coefficient) || 0;
                            }
                          });
                          return { obtained, possible };
                        });
                        const periodAvgs = periodSums.map(({ obtained, possible }) =>
                          possible > 0 ? Math.round((obtained / possible) * 10 * 100) / 100 : null,
                        );
                        return (
                          <>
                            <tr className="border-t-2 border-[var(--app-border)] bg-slate-50 font-medium">
                              <td className="py-2 px-2 text-slate-900">Somme points</td>
                              {periodSums.map((sum, i) => (
                                <td key={examResults.periods?.[i]?.id ?? i} className="py-2 px-2 text-center">
                                  {sum.possible > 0 ? `${sum.obtained}/${sum.possible}` : "—"}
                                </td>
                              ))}
                              <td className="py-2 px-2 text-center">—</td>
                            </tr>
                            <tr className="border-b border-[var(--app-border)] bg-slate-50 font-medium">
                              <td className="py-2 px-2 text-slate-900">Moy. période /10</td>
                              {periodAvgs.map((avg, i) => (
                                <td key={examResults.periods?.[i]?.id ?? `avg-${i}`} className="py-2 px-2 text-center">
                                  {avg != null ? avg.toFixed(2) : "—"}
                                </td>
                              ))}
                              <td className="py-2 px-2 text-center">—</td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>

                  {/* Moyenne générale + Décision fin d'année */}
                  <div className="flex flex-wrap gap-6 mt-6 pt-4 border-t border-[var(--app-border)]">
                    {formationDecision?.average != null && (
                      <div>
                        <span className="text-slate-600 text-sm">Moyenne générale /10 : </span>
                        <span className="font-bold text-lg text-slate-900">{Number(formationDecision.average).toFixed(2)}</span>
                      </div>
                    )}
                    {formationDecision?.decision && (
                      <div>
                        <span className="text-slate-600 text-sm">Décision : </span>
                        <span
                          className={`inline-block px-3 py-1 rounded-lg font-semibold text-sm ${
                            formationDecision.decision === "ADMIS"
                              ? "bg-green-100 text-green-800"
                              : formationDecision.decision === "ADMIS_AILLEURS"
                                ? "bg-emerald-100 text-emerald-800"
                                : formationDecision.decision === "REDOUBLER"
                                  ? "bg-amber-100 text-amber-800"
                                  : formationDecision.decision === "AJOURNE"
                                    ? "bg-orange-100 text-orange-800"
                                    : formationDecision.decision === "RENVOYE_DEFINITIVEMENT" || formationDecision.decision === "RENVOYE" || formationDecision.decision === "EXPELLED"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {DECISION_LABELS[formationDecision.decision] ?? formationDecision.decision}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Aucune note pour cette année. Sélectionnez une autre année ou assurez-vous que les notes sont saisies.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
