import { API_BASE, fetchWithAuth } from "@/services/api";
import type { PdfSection } from "@/lib/pdfExport";

const HAITI = "America/Port-au-Prince";

export type MonitorSection =
  | "jour"
  | "presences"
  | "argent"
  | "discipline"
  | "moyennes"
  | "travaux";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;

export type RollStudent = {
  id: string;
  first_name: string;
  last_name: string;
  status: AttendanceStatus;
  room_id: string | null;
  room_name: string | null;
};

export type PresenceCard = {
  key: string;
  class_id: string;
  class_name: string;
  level: string | null;
  room_id: string | null;
  room_name: string | null;
  students: RollStudent[];
  failed: boolean;
};

export type ClassRoll = {
  class_id: string;
  class_name: string;
  level: string | null;
  students: RollStudent[];
  failed: boolean;
};

export type MeasureRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  label: string | null;
  reason: string | null;
};

export type LatenessRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  class_name: string | null;
  arrival_time: string | null;
};

export type AcademicStudent = {
  id: string;
  name: string;
  class_id: string | null;
  class_name: string | null;
  average: number;
};

export type AcademicClass = {
  class_id: string;
  class_name: string;
  students: number;
  graded_students: number;
  average: number | null;
  success_rate: number | null;
};

export type AcademicTeacher = {
  teacher_id: number;
  teacher_name: string;
  graded_students: number;
  average: number | null;
  success_rate: number | null;
};

export type WorkRow = {
  id: string;
  kind: string;
  title: string;
  class_name: string | null;
  subject_name: string | null;
  teacher_name: string | null;
  due_date: string | null;
};

export type PaymentRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  class_name: string | null;
  service_name: string | null;
  amount_paid: number;
};

export type DebtorRow = {
  student_id: string;
  student_name: string;
  class_name: string | null;
  balance: number;
};

export type ScheduleSlot = {
  id: string;
  subject_name: string | null;
  teacher_name: string | null;
  room_name: string | null;
  start_time: string;
  end_time: string;
};

export type SearchHit = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
  order_number: string | null;
};

export type MonitorContext = {
  yearId: string | null;
  yearName: string | null;
  periodId: string | null;
  periodName: string | null;
};

export type MonitorSnapshot = {
  today: string;
  context: MonitorContext;
  rolls: ClassRoll[];
  measures: MeasureRow[];
  latenesses: LatenessRow[];
  schoolAverage: number | null;
  successRate: number | null;
  gradedStudents: number;
  threshold: number | null;
  byClass: AcademicClass[];
  byTeacher: AcademicTeacher[];
  averages: Map<string, AcademicStudent>;
  works: WorkRow[];
  collectedToday: number | null;
  collectionRate: number | null;
  studentsWithBalance: number | null;
  balance: number | null;
  paymentsToday: PaymentRow[];
  debtors: DebtorRow[];
};

export function haitiToday(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HAITI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function haitiWeekdayIndex(date = new Date()): number {
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: HAITI,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[w] ?? date.getDay();
}

export function haitiNowMinutes(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HAITI,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: HAITI,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function formatAverage(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export function formatClock(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 5);
}

export function statusLabel(status: AttendanceStatus | string | null | undefined): string {
  if (status === "PRESENT") return "Présent";
  if (status === "ABSENT") return "Absent";
  if (status === "LATE") return "Retard";
  if (status === "EXCUSED") return "Excusé";
  if (status == null || status === "") return "Non appelé";
  return String(status);
}

export function kindLabel(kind: string | null | undefined): string {
  if (kind === "LECON") return "Leçon";
  if (kind === "DEVOIR") return "Devoir";
  return kind || "—";
}

export function studentLabel(first: string | null | undefined, last: string | null | undefined): string {
  return [last, first].filter(Boolean).join(", ") || "—";
}

function clockToMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h || 0) * 60 + Number(m || 0);
}

export function currentSlots(slots: ScheduleSlot[], nowMinutes: number): ScheduleSlot[] {
  return slots.filter((s) => {
    const start = clockToMinutes(s.start_time);
    const end = clockToMinutes(s.end_time);
    return nowMinutes >= start && nowMinutes < end;
  });
}

export function countStatus(students: RollStudent[], status: AttendanceStatus): number {
  return students.filter((s) => (s.status ?? null) === status).length;
}

export function presenceCards(rolls: ClassRoll[]): PresenceCard[] {
  const cards: PresenceCard[] = [];
  const ordered = [...rolls].sort((a, b) => a.class_name.localeCompare(b.class_name, "fr"));
  for (const roll of ordered) {
    if (roll.failed || roll.students.length === 0) {
      cards.push({
        key: roll.class_id,
        class_id: roll.class_id,
        class_name: roll.class_name,
        level: roll.level,
        room_id: null,
        room_name: null,
        students: roll.students,
        failed: roll.failed,
      });
      continue;
    }
    const groups = new Map<string, RollStudent[]>();
    for (const student of roll.students) {
      const id = student.room_id || "";
      const list = groups.get(id) ?? [];
      list.push(student);
      groups.set(id, list);
    }
    const entries = [...groups.entries()].sort((a, b) => {
      if (!a[0]) return 1;
      if (!b[0]) return -1;
      return (a[1][0]?.room_name || "").localeCompare(b[1][0]?.room_name || "", "fr");
    });
    for (const [roomId, students] of entries) {
      cards.push({
        key: `${roll.class_id}:${roomId || "sans"}`,
        class_id: roll.class_id,
        class_name: roll.class_name,
        level: roll.level,
        room_id: roomId || null,
        room_name: roomId ? students[0]?.room_name || "Salle" : null,
        students,
        failed: false,
      });
    }
  }
  return cards;
}

export function rollTotals(rolls: ClassRoll[]) {
  const students = rolls.flatMap((r) => (r.failed ? [] : r.students));
  return {
    effectif: students.length,
    presents: countStatus(students, "PRESENT"),
    lates: countStatus(students, "LATE"),
    absents: countStatus(students, "ABSENT"),
    excused: countStatus(students, "EXCUSED"),
    missing: countStatus(students, null),
  };
}

export function namedAbsents(rolls: ClassRoll[]): { name: string; class_name: string; id: string }[] {
  const rows: { name: string; class_name: string; id: string }[] = [];
  for (const roll of rolls) {
    if (roll.failed) continue;
    for (const s of roll.students) {
      if (s.status === "ABSENT") {
        rows.push({
          id: s.id,
          name: studentLabel(s.first_name, s.last_name),
          class_name: roll.class_name,
        });
      }
    }
  }
  return rows;
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetchWithAuth(`${API_BASE}${path}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function haitiDateOf(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return haitiToday(date);
}

async function loadWorks(yearId: string | null, today: string): Promise<WorkRow[]> {
  const found: WorkRow[] = [];
  let offset = 0;
  for (let page = 0; page < 8; page += 1) {
    const q = new URLSearchParams({ limit: "40", offset: String(offset) });
    if (yearId) q.set("academic_year_id", yearId);
    const data = await getJson<{
      assignments?: Array<{
        id: string;
        kind: string;
        title: string;
        class_name: string | null;
        subject_name: string | null;
        teacher_name: string | null;
        due_date: string | null;
        created_at: string;
      }>;
      has_more?: boolean;
    }>(`/homework?${q.toString()}`);
    const list = data?.assignments ?? [];
    if (!list.length) break;
    let older = 0;
    for (const item of list) {
      const created = haitiDateOf(item.created_at);
      const due = (item.due_date ?? "").slice(0, 10);
      if (created === today || due === today) {
        found.push({
          id: item.id,
          kind: item.kind,
          title: item.title,
          class_name: item.class_name,
          subject_name: item.subject_name,
          teacher_name: item.teacher_name,
          due_date: due || null,
        });
      }
      if (created && created < today) older += 1;
    }
    if (!data?.has_more || older === list.length) break;
    offset += list.length;
  }
  return found;
}

export type PresenceBoard = {
  today: string;
  context: MonitorContext;
  rolls: ClassRoll[];
};

export type MonitorDetails = Omit<MonitorSnapshot, "today" | "context" | "rolls">;

export async function loadPresenceBoard(): Promise<PresenceBoard> {
  const today = haitiToday();
  const ctx = await getJson<{
    current_academic_year_id?: string | null;
    current_academic_year_name?: string | null;
    current_period_id?: string | null;
    current_period_name?: string | null;
  }>("/school/current-context");
  const context: MonitorContext = {
    yearId: ctx?.current_academic_year_id ?? null,
    yearName: ctx?.current_academic_year_name ?? null,
    periodName: ctx?.current_period_name ?? null,
    periodId: ctx?.current_period_id ?? null,
  };

  const classData = await getJson<{
    classes?: Array<{ id: string; name: string; level?: string | null; active?: boolean }>;
  }>("/classes");
  const classes = (classData?.classes ?? []).filter((c) => c.active !== false);

  const rolls = await mapPool(classes, 6, async (cls): Promise<ClassRoll> => {
    const data = await getJson<{
      students?: RollStudent[];
    }>(`/discipline/attendance?class_id=${encodeURIComponent(cls.id)}&date=${today}`);
    if (!data) return { class_id: cls.id, class_name: cls.name, level: cls.level ?? null, students: [], failed: true };
    return {
      class_id: cls.id,
      class_name: cls.name,
      level: cls.level ?? null,
      failed: false,
      students: (data.students ?? []).map((s) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        status: (s.status as AttendanceStatus) ?? null,
        room_id: s.room_id ?? null,
        room_name: s.room_name ?? null,
      })),
    };
  });

  return { today, context, rolls };
}

export async function loadMonitorDetails(
  today: string,
  context: MonitorContext,
  showMoney: boolean,
): Promise<MonitorDetails> {
  const academicQuery = new URLSearchParams();
  if (context.yearId) academicQuery.set("academic_year_id", context.yearId);
  if (context.periodId) academicQuery.set("period_id", context.periodId);

  const [measuresData, latenessData, academic, works, finance, txPage] = await Promise.all([
    getJson<{ measures?: MeasureRow[] }>("/discipline/measures"),
    getJson<{ latenesses?: LatenessRow[] }>(`/discipline/latenesses?date=${today}`),
    getJson<{
      overview?: {
        school_average?: number | null;
        success_rate?: number | null;
        graded_students?: number;
        reference_threshold?: { min_average_admis?: number } | null;
      };
      by_class?: AcademicClass[];
      by_teacher?: AcademicTeacher[];
      top_students?: AcademicStudent[];
      bottom_students?: AcademicStudent[];
    }>(`/statistics/academic?${academicQuery.toString()}`),
    loadWorks(context.yearId, today),
    showMoney
      ? getJson<{
          overview?: {
            collection_rate?: number | null;
            students_with_balance?: number;
            balance?: number;
          };
          cashflow?: { total_entrees?: number };
          top_debtors?: DebtorRow[];
        }>(
          `/statistics/financial?${new URLSearchParams({
            ...(context.yearName ? { academic_year: context.yearName } : {}),
            date_from: today,
            date_to: today,
          }).toString()}`,
        )
      : Promise.resolve(null),
    showMoney
      ? getJson<{
          transactions?: Array<PaymentRow & { payment_date?: string; cancelled_at?: string | null }>;
        }>(
          `/economat/transactions?${new URLSearchParams({
            ...(context.yearName ? { academic_year: context.yearName } : {}),
            limit: "100",
          }).toString()}`,
        )
      : Promise.resolve(null),
  ]);

  const averages = new Map<string, AcademicStudent>();
  for (const row of [...(academic?.top_students ?? []), ...(academic?.bottom_students ?? [])]) {
    if (row?.id) averages.set(row.id, row);
  }

  const paymentsToday = (txPage?.transactions ?? []).filter((t) => {
    if (t.cancelled_at) return false;
    return (t.payment_date ?? "").slice(0, 10) === today;
  });

  return {
    measures: measuresData?.measures ?? [],
    latenesses: latenessData?.latenesses ?? [],
    schoolAverage: academic?.overview?.school_average ?? null,
    successRate: academic?.overview?.success_rate ?? null,
    gradedStudents: academic?.overview?.graded_students ?? 0,
    threshold: academic?.overview?.reference_threshold?.min_average_admis ?? null,
    byClass: academic?.by_class ?? [],
    byTeacher: academic?.by_teacher ?? [],
    averages,
    works,
    collectedToday: finance ? Number(finance.cashflow?.total_entrees ?? 0) : null,
    collectionRate: finance?.overview?.collection_rate ?? null,
    studentsWithBalance: finance?.overview?.students_with_balance ?? null,
    balance: finance?.overview?.balance ?? null,
    paymentsToday,
    debtors: finance?.top_debtors ?? [],
  };
}

export async function loadClassAverages(
  classId: string,
  context: MonitorContext,
): Promise<AcademicStudent[]> {
  const q = new URLSearchParams({ class_id: classId });
  if (context.yearId) q.set("academic_year_id", context.yearId);
  const data = await getJson<{
    top_students?: AcademicStudent[];
    bottom_students?: AcademicStudent[];
  }>(`/statistics/academic?${q.toString()}`);
  return [...(data?.top_students ?? []), ...(data?.bottom_students ?? [])];
}

export async function loadSchedule(classId: string, yearName: string | null): Promise<ScheduleSlot[]> {
  const q = new URLSearchParams({
    class_id: classId,
    day_of_week: String(haitiWeekdayIndex()),
  });
  if (yearName) q.set("academic_year", yearName);
  const data = await getJson<{ schedule_slots?: ScheduleSlot[] }>(`/schedule-slots?${q.toString()}`);
  return data?.schedule_slots ?? [];
}

export async function searchStudents(q: string): Promise<SearchHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const data = await getJson<{ students?: SearchHit[] }>(
    `/students/search?${new URLSearchParams({ q: query, status: "active", limit: "8" }).toString()}`,
  );
  return data?.students ?? [];
}

export type PaymentStanding = { label: string; balance: number | null };

export async function loadPaymentStanding(studentId: string, yearName: string | null): Promise<PaymentStanding> {
  const q = new URLSearchParams();
  if (yearName) q.set("academic_year", yearName);
  const data = await getJson<{
    by_service?: Array<{ balance?: number }>;
  }>(`/economat/student-payment-status/${encodeURIComponent(studentId)}?${q.toString()}`);
  const rows = data?.by_service ?? [];
  if (!rows.length) return { label: "—", balance: null };
  const balance = rows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
  const rounded = Math.round(balance * 100) / 100;
  if (rounded <= 0.01) return { label: "Payé", balance: 0 };
  return { label: formatNumber(rounded), balance: rounded };
}

function line(text: string): PdfSection {
  return { lines: [text] };
}

function table(title: string, columns: { header: string; key: string }[], rows: Record<string, string>[]): PdfSection {
  if (!rows.length) return { title, lines: ["Aucun"] };
  return { title, table: { columns, rows } };
}

export function monitoringPdf(
  section: MonitorSection,
  data: MonitorSnapshot,
  showMoney: boolean,
): { title: string; filename: string; sections: PdfSection[] } {
  const date = formatLongDate(data.today);
  const year = [data.context.yearName, data.context.periodName].filter(Boolean).join(" · ");
  const subtitle = [date, year].filter(Boolean).join(" — ");
  const totals = rollTotals(data.rolls);
  const absents = namedAbsents(data.rolls);
  const uncalled = data.rolls.filter((r) => r.failed || countStatus(r.students, null) > 0);

  const presenceRows = presenceCards(data.rolls).map((card) => ({
    salle: card.room_name || "—",
    classe: card.class_name,
    effectif: card.failed ? "—" : String(card.students.length),
    presents: card.failed ? "—" : String(countStatus(card.students, "PRESENT")),
    retards: card.failed ? "—" : String(countStatus(card.students, "LATE")),
    absents: card.failed ? "—" : String(countStatus(card.students, "ABSENT")),
    excuses: card.failed ? "—" : String(countStatus(card.students, "EXCUSED")),
    non: card.failed ? "—" : String(countStatus(card.students, null)),
  }));

  const presenceTable = table(
    "Présences",
    [
      { header: "Salle", key: "salle" },
      { header: "Classe", key: "classe" },
      { header: "Effectif", key: "effectif" },
      { header: "Présents", key: "presents" },
      { header: "Retards", key: "retards" },
      { header: "Absents", key: "absents" },
      { header: "Excusés", key: "excuses" },
      { header: "Non appelés", key: "non" },
    ],
    presenceRows,
  );

  if (section === "presences") {
    return {
      title: "Présences",
      filename: `presences-${data.today}`,
      sections: [line(subtitle), presenceTable, table("Absents", [
        { header: "Élève", key: "eleve" },
        { header: "Classe", key: "classe" },
      ], absents.map((a) => ({ eleve: a.name, classe: a.class_name })))],
    };
  }

  if (section === "argent") {
    return {
      title: "Finance",
      filename: `finance-${data.today}`,
      sections: [
        line(subtitle),
        line(`Encaissé aujourd'hui : ${formatNumber(data.collectedToday)}`),
        line(`Recouvrement : ${formatPercent(data.collectionRate)}`),
        line(`Élèves débiteurs : ${formatNumber(data.studentsWithBalance)}`),
        line(`Reste à recouvrer : ${formatNumber(data.balance)}`),
        table("Paiements du jour", [
          { header: "Élève", key: "eleve" },
          { header: "Classe", key: "classe" },
          { header: "Service", key: "service" },
          { header: "Montant", key: "montant" },
        ], data.paymentsToday.map((p) => ({
          eleve: p.student_name || "—",
          classe: p.class_name || "—",
          service: p.service_name || "—",
          montant: formatNumber(p.amount_paid),
        }))),
        table("Soldes", [
          { header: "Élève", key: "eleve" },
          { header: "Classe", key: "classe" },
          { header: "Solde", key: "solde" },
        ], data.debtors.map((d) => ({
          eleve: d.student_name,
          classe: d.class_name || "—",
          solde: formatNumber(d.balance),
        }))),
      ],
    };
  }

  if (section === "discipline") {
    return {
      title: "Discipline",
      filename: `discipline-${data.today}`,
      sections: [
        line(subtitle),
        line(`Sanctions en cours : ${data.measures.length}`),
        line(`Retards : ${data.latenesses.length}`),
        line(`Absents : ${totals.absents}`),
        table("Sanctions", [
          { header: "Élève", key: "eleve" },
          { header: "Mesure", key: "mesure" },
          { header: "Motif", key: "motif" },
        ], data.measures.map((m) => ({
          eleve: m.student_name || "—",
          mesure: m.label || "—",
          motif: m.reason || "—",
        }))),
        table("Retards", [
          { header: "Élève", key: "eleve" },
          { header: "Classe", key: "classe" },
          { header: "Arrivée", key: "arrivee" },
        ], data.latenesses.map((l) => ({
          eleve: l.student_name || "—",
          classe: l.class_name || "—",
          arrivee: formatClock(l.arrival_time),
        }))),
        table("Absents", [
          { header: "Élève", key: "eleve" },
          { header: "Classe", key: "classe" },
        ], absents.map((a) => ({ eleve: a.name, classe: a.class_name }))),
      ],
    };
  }

  if (section === "moyennes") {
    return {
      title: "Moyennes",
      filename: `moyennes-${data.today}`,
      sections: [
        line(subtitle),
        line(`Moyenne : ${formatAverage(data.schoolAverage)}`),
        line(`Au-dessus du seuil : ${formatPercent(data.successRate)}`),
        line(`Élèves notés : ${formatNumber(data.gradedStudents)}`),
        ...(data.threshold != null ? [line(`Seuil : ${formatAverage(data.threshold)}`)] : []),
        table("Classes", [
          { header: "Classe", key: "classe" },
          { header: "Notés", key: "notes" },
          { header: "Moyenne", key: "moyenne" },
          { header: "Réussite", key: "reussite" },
        ], data.byClass.map((c) => ({
          classe: c.class_name,
          notes: String(c.graded_students),
          moyenne: formatAverage(c.average),
          reussite: formatPercent(c.success_rate),
        }))),
        table("Professeurs", [
          { header: "Professeur", key: "prof" },
          { header: "Notés", key: "notes" },
          { header: "Moyenne", key: "moyenne" },
          { header: "Réussite", key: "reussite" },
        ], data.byTeacher.map((t) => ({
          prof: t.teacher_name,
          notes: String(t.graded_students),
          moyenne: formatAverage(t.average),
          reussite: formatPercent(t.success_rate),
        }))),
        table("Au-dessus", [
          { header: "Élève", key: "eleve" },
          { header: "Classe", key: "classe" },
          { header: "Moyenne", key: "moyenne" },
        ], [...data.averages.values()]
          .filter((s) => data.threshold == null || s.average >= data.threshold)
          .sort((a, b) => b.average - a.average)
          .slice(0, 15)
          .map((s) => ({
            eleve: s.name,
            classe: s.class_name || "—",
            moyenne: formatAverage(s.average),
          }))),
        table("En dessous", [
          { header: "Élève", key: "eleve" },
          { header: "Classe", key: "classe" },
          { header: "Moyenne", key: "moyenne" },
        ], [...data.averages.values()]
          .filter((s) => data.threshold != null && s.average < data.threshold)
          .sort((a, b) => a.average - b.average)
          .slice(0, 15)
          .map((s) => ({
            eleve: s.name,
            classe: s.class_name || "—",
            moyenne: formatAverage(s.average),
          }))),
      ],
    };
  }

  if (section === "travaux") {
    return {
      title: "Leçons et devoirs",
      filename: `travaux-${data.today}`,
      sections: [
        line(subtitle),
        table("Travaux", [
          { header: "Type", key: "type" },
          { header: "Titre", key: "titre" },
          { header: "Classe", key: "classe" },
          { header: "Matière", key: "matiere" },
          { header: "Professeur", key: "prof" },
        ], data.works.map((w) => ({
          type: kindLabel(w.kind),
          titre: w.title,
          classe: w.class_name || "—",
          matiere: w.subject_name || "—",
          prof: w.teacher_name || "—",
        }))),
      ],
    };
  }

  const sections: PdfSection[] = [
    line(subtitle),
    line(`Présents : ${totals.presents}`),
    line(`Absents : ${totals.absents}`),
    line(`Retards : ${totals.lates}`),
    line(`Non appelés : ${totals.missing}`),
    line(`Sanctions : ${data.measures.length}`),
    line(`Moyenne : ${formatAverage(data.schoolAverage)}`),
    line(`Travaux : ${data.works.length}`),
  ];
  if (showMoney) sections.push(line(`Encaissé aujourd'hui : ${formatNumber(data.collectedToday)}`));
  sections.push(
    presenceTable,
    table("Absents", [
      { header: "Élève", key: "eleve" },
      { header: "Classe", key: "classe" },
    ], absents.map((a) => ({ eleve: a.name, classe: a.class_name }))),
    table("Appel incomplet", [
      { header: "Classe", key: "classe" },
    ], uncalled.map((r) => ({ classe: r.failed ? `${r.class_name} — indisponible` : r.class_name }))),
    table("Sanctions", [
      { header: "Élève", key: "eleve" },
      { header: "Mesure", key: "mesure" },
      { header: "Motif", key: "motif" },
    ], data.measures.map((m) => ({
      eleve: m.student_name || "—",
      mesure: m.label || "—",
      motif: m.reason || "—",
    }))),
    table("Retards", [
      { header: "Élève", key: "eleve" },
      { header: "Classe", key: "classe" },
      { header: "Arrivée", key: "arrivee" },
    ], data.latenesses.map((l) => ({
      eleve: l.student_name || "—",
      classe: l.class_name || "—",
      arrivee: formatClock(l.arrival_time),
    }))),
    table("Leçons et devoirs", [
      { header: "Type", key: "type" },
      { header: "Titre", key: "titre" },
      { header: "Classe", key: "classe" },
      { header: "Professeur", key: "prof" },
    ], data.works.map((w) => ({
      type: kindLabel(w.kind),
      titre: w.title,
      classe: w.class_name || "—",
      prof: w.teacher_name || "—",
    }))),
  );
  if (showMoney) {
    sections.push(table("Paiements du jour", [
      { header: "Élève", key: "eleve" },
      { header: "Classe", key: "classe" },
      { header: "Montant", key: "montant" },
    ], data.paymentsToday.map((p) => ({
      eleve: p.student_name || "—",
      classe: p.class_name || "—",
      montant: formatNumber(p.amount_paid),
    }))));
  }
  return { title: "Aujourd'hui", filename: `aujourdhui-${data.today}`, sections };
}

export function haitiMonthStart(today = haitiToday()): string {
  return `${today.slice(0, 8)}01`;
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: HAITI,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 15, 0, 0)));
}

export type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  class_name: string | null;
};

export type PeriodAverage = {
  period_id: string;
  period_name: string;
  order: number;
  average: number | null;
};

export type DueFee = {
  service_name: string;
  due_date: string | null;
  amount_due: number;
  total_paid: number;
  balance: number;
  due_now: boolean;
};

export type MeasureHistoryItem = {
  id: string;
  label: string | null;
  reason: string | null;
  created_at: string | null;
  active: boolean;
};

export type ClassDay = {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  missing: number;
  absents: string[];
};

export async function loadClassAttendance(
  classId: string,
  from: string,
  to: string,
  roomId: string | null,
): Promise<ClassDay[]> {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  if (roomId) q.set("room_id", roomId);
  else q.set("unassigned", "1");
  const data = await getJson<{ days?: ClassDay[] }>(
    `/discipline/attendance/class/${encodeURIComponent(classId)}?${q.toString()}`,
  );
  return (data?.days ?? []).map((row) => ({
    date: String(row.date).slice(0, 10),
    present: Number(row.present ?? 0),
    absent: Number(row.absent ?? 0),
    late: Number(row.late ?? 0),
    excused: Number(row.excused ?? 0),
    missing: Number(row.missing ?? 0),
    absents: row.absents ?? [],
  }));
}

export async function loadStudentAttendance(
  studentId: string,
  from: string,
  to: string,
): Promise<AttendanceRecord[]> {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const data = await getJson<{
    records?: Array<{ id: string; date: string; status: string; class_name: string | null }>;
  }>(`/discipline/attendance/student/${encodeURIComponent(studentId)}?${q.toString()}`);
  return (data?.records ?? []).map((row) => ({
    id: row.id,
    date: String(row.date).slice(0, 10),
    status: row.status,
    class_name: row.class_name,
  }));
}

export async function loadPeriodAverages(
  studentId: string,
  yearId: string | null,
): Promise<PeriodAverage[]> {
  if (!yearId) return [];
  const data = await getJson<{
    periods?: Array<{ id: string; name: string; order_index?: number }>;
    subjects?: Array<{
      periods?: Array<{
        period_id: string;
        coefficient?: number;
        grade_value?: number;
        has_grade?: boolean;
      }>;
    }>;
  }>(
    `/grades/student-exam-results?${new URLSearchParams({
      student_id: studentId,
      academic_year_id: yearId,
    }).toString()}`,
  );
  const periods = data?.periods ?? [];
  const subjects = data?.subjects ?? [];
  return periods
    .map((period) => {
      let obtained = 0;
      let possible = 0;
      for (const subject of subjects) {
        const mark = (subject.periods ?? []).find(
          (row) => String(row.period_id) === String(period.id) && row.has_grade,
        );
        if (!mark) continue;
        const coef = Number(mark.coefficient ?? 0);
        const points = Number(mark.grade_value ?? 0);
        if (coef <= 0) continue;
        obtained += points;
        possible += coef;
      }
      return {
        period_id: period.id,
        period_name: period.name,
        order: period.order_index ?? 0,
        average: possible > 0 ? Math.round((obtained / possible) * 100) / 10 : null,
      };
    })
    .sort((a, b) => a.order - b.order);
}

export async function loadDueFees(
  studentId: string,
  yearName: string | null,
  today = haitiToday(),
): Promise<DueFee[]> {
  const q = new URLSearchParams();
  if (yearName) q.set("academic_year", yearName);
  const data = await getJson<{
    by_service?: Array<{
      service_name?: string;
      due_date?: string | null;
      amount_due?: number;
      total_paid?: number;
      balance?: number;
    }>;
  }>(`/economat/student-payment-status/${encodeURIComponent(studentId)}?${q.toString()}`);
  return (data?.by_service ?? [])
    .map((row) => {
      const balance = Math.round(Number(row.balance ?? 0) * 100) / 100;
      const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
      return {
        service_name: row.service_name || "—",
        due_date: due,
        amount_due: Number(row.amount_due ?? 0),
        total_paid: Number(row.total_paid ?? 0),
        balance,
        due_now: balance > 0.01 && (!due || due <= today),
      };
    })
    .filter((row) => row.balance > 0.01 || row.amount_due > 0);
}

export async function loadMeasureHistory(studentId: string): Promise<MeasureHistoryItem[]> {
  const data = await getJson<{
    measures?: Array<{
      id: string;
      label?: string | null;
      reason?: string | null;
      created_at?: string | null;
      active?: boolean;
    }>;
  }>(`/discipline/measures?${new URLSearchParams({ student_id: studentId, history: "1" }).toString()}`);
  return (data?.measures ?? []).map((row) => ({
    id: row.id,
    label: row.label ?? null,
    reason: row.reason ?? null,
    created_at: row.created_at ?? null,
    active: row.active !== false,
  }));
}

export function dueNowTotal(fees: DueFee[]): number {
  return Math.round(fees.filter((row) => row.due_now).reduce((sum, row) => sum + row.balance, 0) * 100) / 100;
}

export function studentPdf(input: {
  name: string;
  klass: string;
  today: string;
  status: string;
  measure: string;
  attendance: AttendanceRecord[];
  periods: PeriodAverage[];
  fees: DueFee[] | null;
  sanctions: MeasureHistoryItem[];
}): { title: string; filename: string; sections: PdfSection[] } {
  const sections: PdfSection[] = [
    {
      lines: [
        formatLongDate(input.today),
        input.klass,
        `Aujourd'hui : ${input.status}`,
        `Sanction en cours : ${input.measure}`,
      ],
    },
    table("Présences", [
      { header: "Date", key: "date" },
      { header: "Appel", key: "appel" },
      { header: "Classe", key: "classe" },
    ], input.attendance.map((row) => ({
      date: formatShortDate(row.date),
      appel: statusLabel(row.status),
      classe: row.class_name || "—",
    }))),
    table("Moyennes", [
      { header: "Période", key: "periode" },
      { header: "Moyenne", key: "moyenne" },
    ], input.periods.map((row) => ({
      periode: row.period_name,
      moyenne: formatAverage(row.average),
    }))),
  ];
  if (input.fees) {
    sections.push(
      line(`À verser : ${formatNumber(dueNowTotal(input.fees))}`),
      table("Économat", [
        { header: "Service", key: "service" },
        { header: "Échéance", key: "echeance" },
        { header: "Dû", key: "du" },
        { header: "Payé", key: "paye" },
        { header: "Solde", key: "solde" },
      ], input.fees.filter((row) => row.balance > 0.01).map((row) => ({
        service: row.service_name,
        echeance: row.due_date ? formatShortDate(row.due_date) : "—",
        du: formatNumber(row.amount_due),
        paye: formatNumber(row.total_paid),
        solde: formatNumber(row.balance),
      }))),
    );
  }
  sections.push(table("Sanctions", [
    { header: "Date", key: "date" },
    { header: "Mesure", key: "mesure" },
    { header: "Motif", key: "motif" },
    { header: "État", key: "etat" },
  ], input.sanctions.map((row) => ({
    date: formatShortDate(row.created_at),
    mesure: row.label || "—",
    motif: row.reason || "—",
    etat: row.active ? "En cours" : "Terminée",
  }))));
  const slug = input.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-]/g, "") || "eleve";
  return {
    title: input.name,
    filename: `eleve-${slug}-${input.today}`,
    sections,
  };
}
