import { useEffect, useMemo, useState, type ReactNode } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { useSchoolProfile } from "@/context/SchoolProfileContext";
import { isTeacherRole } from "@/lib/dashboardRoles";

type Year = { id: string; name: string };
type Period = { id: string; name: string };
type Opt = { id: string; name: string; class_id?: string | null };
type TeacherOpt = { id: number; name: string };

type DecisionKind = "admis" | "admis_ailleurs" | "redoubler" | "ajourne" | "renvoye";
type DecisionCounts = Record<DecisionKind, number>;
type ClassThreshold = {
  min_average_admis: number;
  min_average_admis_ailleurs: number;
  min_average_redoubler: number;
  min_average_ajourne: number;
};

type AcademicStats = {
  academic_year_id: string | null;
  academic_year_name: string | null;
  period_id: string | null;
  period_name: string | null;
  viewer: {
    mode: "admin" | "teacher";
    profile: "homeroom" | "specialist" | "mixed" | "none" | "school";
    teacher_id: number | null;
    teacher_name: string | null;
    assignments: {
      class_id: string;
      class_name: string;
      subject_id: string;
      subject_name: string;
      room_id: string | null;
      room_name: string | null;
    }[];
  };
  overview: {
    classes: number;
    students: number;
    teachers: number;
    grades: number;
    graded_students: number;
    school_average: number | null;
    success_rate: number | null;
    decisions: DecisionCounts;
    reference_threshold: ClassThreshold;
  };
  decisions: DecisionCounts;
  by_class: {
    class_id: string;
    class_name: string;
    level: string | null;
    students: number;
    graded_students: number;
    average: number | null;
    success_rate: number | null;
    decisions: DecisionCounts;
    threshold: ClassThreshold;
  }[];
  by_subject: { subject_id: string; subject_name: string; grades_count: number; average: number | null }[];
  by_teacher: {
    teacher_id: number;
    teacher_name: string;
    assignments: number;
    grades_count: number;
    graded_students: number;
    average: number | null;
    success_rate: number | null;
    decisions: DecisionCounts;
  }[];
  by_class_subject: {
    class_id: string;
    class_name: string;
    room_id: string | null;
    room_name: string | null;
    subject_id: string;
    subject_name: string;
    grades_count: number;
    graded_students: number;
    average: number | null;
  }[];
  class_comparison_by_subject: {
    subject_id: string;
    subject_name: string;
    classes: {
      class_id: string;
      class_name: string;
      room_id: string | null;
      room_name: string | null;
      average: number | null;
    }[];
    strongest: { class_name: string; room_name: string | null; average: number | null } | null;
    weakest: { class_name: string; room_name: string | null; average: number | null } | null;
  }[];
  subject_comparison_by_class: {
    class_id: string;
    class_name: string;
    room_id: string | null;
    room_name: string | null;
    subjects: { subject_id: string; subject_name: string; average: number | null }[];
    strongest: { subject_name: string; average: number | null } | null;
    weakest: { subject_name: string; average: number | null } | null;
  }[];
  top_students: {
    id: string;
    name: string;
    class_id?: string | null;
    class_name: string | null;
    room_name: string | null;
    average: number;
    decision?: DecisionKind;
  }[];
  bottom_students: {
    id: string;
    name: string;
    class_id?: string | null;
    class_name: string | null;
    room_name: string | null;
    average: number;
    decision?: DecisionKind;
  }[];
  discipline: {
    absences: number;
    presents: number;
    latenesses: number;
    deductions_count: number;
    deductions_points: number;
    students_low_points: number;
  };
  insights: { headline: string; points: string[] };
  filter_options: {
    classes: Opt[];
    subjects: Opt[];
    teachers: TeacherOpt[];
    rooms: Opt[];
  };
};

type TabId = "vue" | "classes" | "matieres" | "professeurs" | "eleves" | "discipline";

const DECISION_ORDER: DecisionKind[] = ["admis", "admis_ailleurs", "redoubler", "ajourne", "renvoye"];

const DECISION_META: Record<DecisionKind, { label: string; color: string; text: string }> = {
  admis: { label: "Admis", color: "#34d399", text: "text-emerald-700" },
  admis_ailleurs: { label: "Admis ailleurs", color: "#38bdf8", text: "text-sky-700" },
  redoubler: { label: "Redoubler", color: "#fbbf24", text: "text-amber-700" },
  ajourne: { label: "Ajourné", color: "#f97316", text: "text-orange-700" },
  renvoye: { label: "Renvoyé", color: "#f87171", text: "text-red-700" },
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtInt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("fr-FR");
}

function decide(avg: number | null | undefined, t: ClassThreshold | undefined): DecisionKind | null {
  if (avg == null || Number.isNaN(avg) || !t) return null;
  if (avg >= t.min_average_admis) return "admis";
  if (avg >= t.min_average_admis_ailleurs) return "admis_ailleurs";
  if (avg >= t.min_average_redoubler) return "redoubler";
  if (avg >= t.min_average_ajourne) return "ajourne";
  return "renvoye";
}

function avgText(n: number | null | undefined, t: ClassThreshold | undefined) {
  const d = decide(n, t);
  if (!d) return "text-slate-400";
  return DECISION_META[d].text;
}

function barColor(n: number | null | undefined, t: ClassThreshold | undefined) {
  const d = decide(n, t);
  if (!d) return "var(--school-accent-1)";
  return DECISION_META[d].color;
}

function classPlace(row: { class_name: string; room_name?: string | null }) {
  return row.room_name ? `${row.class_name} · ${row.room_name}` : row.class_name;
}

function decisionTotal(d: DecisionCounts | undefined) {
  if (!d) return 0;
  return DECISION_ORDER.reduce((s, k) => s + (d[k] || 0), 0);
}

function filterSelectClass() {
  return "border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm min-w-[150px] bg-white";
}

export function DashboardStatsAcademiquesPage() {
  const ctx = useSchoolProfile();
  const roleName = ctx?.roleName ?? "";
  const teacherView = isTeacherRole(roleName);

  const [years, setYears] = useState<Year[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [yearId, setYearId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [tab, setTab] = useState<TabId>("vue");
  const [stats, setStats] = useState<AcademicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState("average");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    (async () => {
      try {
        const [yRes, ctxRes] = await Promise.all([
          fetchWithAuth(`${API_BASE}/academic-years`),
          fetchWithAuth(`${API_BASE}/school/current-context`),
        ]);
        const yData = await yRes.json();
        const schoolCtx = await ctxRes.json();
        const list: Year[] = yData.academic_years ?? yData.years ?? [];
        setYears(list);
        const current = schoolCtx.current_academic_year_id || list[0]?.id || "";
        setYearId(current);
        if (schoolCtx.current_period_id) setPeriodId(schoolCtx.current_period_id);
      } catch {
        setYears([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!yearId) {
      setPeriods([]);
      return;
    }
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/periods?academic_year_id=${yearId}`);
        const data = await res.json();
        setPeriods(data.periods ?? []);
      } catch {
        setPeriods([]);
      }
    })();
  }, [yearId]);

  useEffect(() => {
    if (!yearId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ academic_year_id: yearId });
        if (periodId) params.set("period_id", periodId);
        if (classId) params.set("class_id", classId);
        if (subjectId) params.set("subject_id", subjectId);
        if (teacherId) params.set("teacher_id", teacherId);
        if (roomId) params.set("room_id", roomId);
        const res = await fetchWithAuth(`${API_BASE}/statistics/academic?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
        setStats(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [yearId, periodId, classId, subjectId, teacherId, roomId]);

  const showTeachersTab = stats?.viewer.mode === "admin" || (!teacherView && stats?.viewer.mode !== "teacher");
  const threshold = stats?.overview.reference_threshold;

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string }[] = [
      { id: "vue", label: "Vue d’ensemble" },
      { id: "classes", label: "Classes" },
      { id: "matieres", label: "Matières" },
    ];
    if (showTeachersTab) list.push({ id: "professeurs", label: "Professeurs" });
    list.push({ id: "eleves", label: "Élèves" }, { id: "discipline", label: "Discipline" });
    return list;
  }, [showTeachersTab]);

  useEffect(() => {
    if (tab === "professeurs" && !showTeachersTab) setTab("vue");
  }, [tab, showTeachersTab]);

  const opts = stats?.filter_options;
  const hasFilters = Boolean(classId || subjectId || teacherId || roomId);
  const classThresholdById = useMemo(() => {
    const map: Record<string, ClassThreshold> = {};
    for (const c of stats?.by_class ?? []) map[c.class_id] = c.threshold;
    return map;
  }, [stats]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortRows<T extends Record<string, unknown>>(rows: T[], key: string): T[] {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "fr") * dir;
    });
  }

  function drillClass(id: string) {
    setClassId(id);
    setTab("vue");
  }
  function drillSubject(id: string) {
    setSubjectId(id);
    setTab("vue");
  }
  function drillTeacher(id: number) {
    setTeacherId(String(id));
    setTab("vue");
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-slate-900">Stats académiques</h2>

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-[var(--app-border)] bg-white shadow-sm">
        <select
          value={yearId}
          onChange={(e) => {
            setYearId(e.target.value);
            setPeriodId("");
          }}
          className={filterSelectClass()}
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={filterSelectClass()}>
          <option value="">Toutes périodes</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={filterSelectClass()}>
          <option value="">Toutes les classes</option>
          {(opts?.classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={filterSelectClass()}>
          <option value="">Toutes les matières</option>
          {(opts?.subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {showTeachersTab && (
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={filterSelectClass()}>
            <option value="">Tous les professeurs</option>
            {(opts?.teachers ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        {(opts?.rooms?.length ?? 0) > 0 && (
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={filterSelectClass()}>
            <option value="">Toutes les salles</option>
            {(opts?.rooms ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setClassId("");
              setSubjectId("");
              setTeacherId("");
              setRoomId("");
            }}
            className="text-sm px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100/80">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-lg transition-colors ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {loading ? (
        <div className="animate-pulse text-slate-500 py-10">Chargement des indicateurs…</div>
      ) : stats ? (
        <>
          {tab === "vue" && (
            <div className="space-y-5">
              <PulseHero
                title={stats.insights?.headline || "Bilan académique de l’école"}
                yearName={stats.academic_year_name}
                periodName={stats.period_name}
                average={stats.overview.school_average}
                admisRate={stats.overview.success_rate}
                decisions={stats.overview.decisions ?? stats.decisions}
                threshold={threshold}
              />

              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="Moyennes par classe">
                  <VerticalBars
                    rows={stats.by_class
                      .filter((c) => c.average != null)
                      .slice(0, 12)
                      .map((c) => ({
                        id: c.class_id,
                        label: c.class_name,
                        value: c.average,
                        color: barColor(c.average, c.threshold ?? threshold),
                        onClick: () => drillClass(c.class_id),
                      }))}
                  />
                </ChartCard>
                <ChartCard title="Moyennes par matière">
                  <VerticalBars
                    rows={stats.by_subject
                      .filter((s) => s.average != null)
                      .slice(0, 12)
                      .map((s) => ({
                        id: s.subject_id,
                        label: s.subject_name,
                        value: s.average,
                        color: barColor(s.average, threshold),
                        onClick: () => drillSubject(s.subject_id),
                      }))}
                  />
                </ChartCard>
              </div>

              {stats.by_class.some((c) => decisionTotal(c.decisions) > 0) && (
                <ChartCard title="Décisions par classe">
                  <div className="space-y-2.5">
                    {stats.by_class
                      .filter((c) => decisionTotal(c.decisions) > 0)
                      .map((c) => (
                        <button
                          key={c.class_id}
                          type="button"
                          onClick={() => drillClass(c.class_id)}
                          className="w-full flex items-center gap-3 text-left"
                        >
                          <span className="w-36 shrink-0 text-sm text-slate-700 truncate">{c.class_name}</span>
                          <StackedBar decisions={c.decisions} />
                          <span className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${avgText(c.average, c.threshold)}`}>
                            {fmt(c.average)}
                          </span>
                        </button>
                      ))}
                  </div>
                  <DecisionLegend />
                </ChartCard>
              )}

              {(stats.viewer.profile === "specialist" || stats.viewer.profile === "mixed" || (stats.viewer.mode === "admin" && teacherId)) &&
                stats.class_comparison_by_subject.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800">Classes par matière</h3>
                  {stats.class_comparison_by_subject.map((block) => (
                    <ComparisonCard
                      key={block.subject_id}
                      title={block.subject_name}
                      threshold={threshold}
                      classThresholdById={classThresholdById}
                      rows={block.classes.map((c) => ({
                        id: c.class_id,
                        label: classPlace(c),
                        average: c.average,
                        onClick: () => drillClass(c.class_id),
                      }))}
                    />
                  ))}
                </div>
              )}

              {(stats.viewer.profile === "homeroom" || stats.viewer.profile === "mixed") &&
                stats.subject_comparison_by_class.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800">Matières de la classe</h3>
                  {stats.subject_comparison_by_class.map((block) => (
                    <ComparisonCard
                      key={`${block.class_id}-${block.room_id ?? ""}`}
                      title={classPlace(block)}
                      threshold={classThresholdById[block.class_id] ?? threshold}
                      rows={block.subjects.map((s) => ({
                        id: s.subject_id,
                        label: s.subject_name,
                        average: s.average,
                        onClick: () => drillSubject(s.subject_id),
                      }))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "classes" && (
            <ChartCard title="Rendement par classe">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <SortTh label="Classe" k="class_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="py-2 pr-2 font-medium">Décisions</th>
                    <SortTh label="Moyenne" k="average" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <SortTh label="Admis" k="success_rate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortRows(stats.by_class as unknown as Record<string, unknown>[], sortKey).map((c) => (
                    <tr
                      key={String(c.class_id)}
                      className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer"
                      onClick={() => drillClass(String(c.class_id))}
                    >
                      <td className="py-3 pr-2 font-medium text-slate-900">{String(c.class_name)}</td>
                      <td className="py-3 pr-3 min-w-[160px]"><StackedBar decisions={c.decisions as DecisionCounts} /></td>
                      <td className={`py-3 pr-2 text-right font-semibold tabular-nums ${avgText(c.average as number, c.threshold as ClassThreshold)}`}>
                        {fmt(c.average as number)}
                      </td>
                      <td className="py-3 text-right text-slate-700 tabular-nums font-medium">
                        {c.success_rate != null ? `${fmt(c.success_rate as number, 0)} %` : "—"}
                      </td>
                    </tr>
                  ))}
                  {stats.by_class.length === 0 && <EmptyRow cols={4} />}
                </tbody>
              </table>
              <DecisionLegend />
            </ChartCard>
          )}

          {tab === "matieres" && (
            <div className="space-y-4">
              <ChartCard title="Rendement par matière">
                <VerticalBars
                  rows={stats.by_subject
                    .filter((s) => s.average != null)
                    .map((s) => ({
                      id: s.subject_id,
                      label: s.subject_name,
                      value: s.average,
                      color: barColor(s.average, threshold),
                      onClick: () => drillSubject(s.subject_id),
                    }))}
                />
                <table className="w-full text-sm mt-4">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <SortTh label="Matière" k="subject_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh label="Moyenne" k="average" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortRows(stats.by_subject as unknown as Record<string, unknown>[], sortKey).map((s) => (
                      <tr
                        key={String(s.subject_id)}
                        className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer"
                        onClick={() => drillSubject(String(s.subject_id))}
                      >
                        <td className="py-2.5 pr-2 font-medium text-slate-900">{String(s.subject_name)}</td>
                        <td className={`py-2.5 text-right font-semibold tabular-nums ${avgText(s.average as number, threshold)}`}>
                          {fmt(s.average as number)}
                        </td>
                      </tr>
                    ))}
                    {stats.by_subject.length === 0 && <EmptyRow cols={2} />}
                  </tbody>
                </table>
              </ChartCard>
              {stats.by_class_subject.length > 0 && (
                <ChartCard title="Classe × matière">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100">
                        <th className="py-2 pr-2 font-medium">Classe</th>
                        <th className="py-2 pr-2 font-medium">Matière</th>
                        <th className="py-2 font-medium text-right">Moyenne</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.by_class_subject.map((r) => (
                        <tr key={`${r.class_id}-${r.room_id}-${r.subject_id}`} className="border-b border-slate-50">
                          <td className="py-2 pr-2 text-slate-800">{classPlace(r)}</td>
                          <td className="py-2 pr-2 text-slate-800">{r.subject_name}</td>
                          <td className={`py-2 text-right font-semibold tabular-nums ${avgText(r.average, classThresholdById[r.class_id] ?? threshold)}`}>
                            {fmt(r.average)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ChartCard>
              )}
            </div>
          )}

          {tab === "professeurs" && showTeachersTab && (
            <ChartCard title="Rendement des professeurs">
              <VerticalBars
                rows={stats.by_teacher
                  .filter((t) => t.average != null)
                  .slice(0, 14)
                  .map((t) => ({
                    id: String(t.teacher_id),
                    label: t.teacher_name || "—",
                    value: t.average,
                    color: barColor(t.average, threshold),
                    onClick: () => drillTeacher(t.teacher_id),
                  }))}
              />
              <table className="w-full text-sm mt-4">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <SortTh label="Professeur" k="teacher_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="py-2 pr-2 font-medium">Décisions</th>
                    <SortTh label="Moyenne" k="average" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <SortTh label="Admis" k="success_rate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortRows(stats.by_teacher as unknown as Record<string, unknown>[], sortKey).map((t) => (
                    <tr
                      key={String(t.teacher_id)}
                      className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer"
                      onClick={() => drillTeacher(Number(t.teacher_id))}
                    >
                      <td className="py-3 pr-2 font-medium text-slate-900">{String(t.teacher_name || "—")}</td>
                      <td className="py-3 pr-3 min-w-[160px]">
                        <StackedBar decisions={t.decisions as DecisionCounts} />
                      </td>
                      <td className={`py-3 pr-2 text-right font-semibold tabular-nums ${avgText(t.average as number, threshold)}`}>
                        {fmt(t.average as number)}
                      </td>
                      <td className="py-3 text-right text-slate-700 tabular-nums font-medium">
                        {t.success_rate != null ? `${fmt(t.success_rate as number, 0)} %` : "—"}
                      </td>
                    </tr>
                  ))}
                  {stats.by_teacher.length === 0 && <EmptyRow cols={4} />}
                </tbody>
              </table>
              <DecisionLegend />
            </ChartCard>
          )}

          {tab === "eleves" && (
            <div className="grid md:grid-cols-2 gap-4">
              <ChartCard title="Meilleurs éléments">
                <StudentRows rows={stats.top_students} classThresholdById={classThresholdById} fallback={threshold} />
              </ChartCard>
              <ChartCard title="Moyennes à accompagner">
                <StudentRows rows={stats.bottom_students} classThresholdById={classThresholdById} fallback={threshold} />
              </ChartCard>
            </div>
          )}

          {tab === "discipline" && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniStat label="Présents" value={fmtInt(stats.discipline.presents)} />
              <MiniStat label="Absences" value={fmtInt(stats.discipline.absences)} accent="text-red-700" />
              <MiniStat label="Retards" value={fmtInt(stats.discipline.latenesses)} />
              <MiniStat label="Sanctions" value={fmtInt(stats.discipline.deductions_count)} />
              <MiniStat label="Points déduits" value={fmtInt(stats.discipline.deductions_points)} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function PulseHero({
  title,
  yearName,
  periodName,
  average,
  admisRate,
  decisions,
  threshold,
}: {
  title: string;
  yearName: string | null;
  periodName: string | null;
  average: number | null;
  admisRate: number | null;
  decisions: DecisionCounts | undefined;
  threshold: ClassThreshold | undefined;
}) {
  const total = decisionTotal(decisions);
  const avgDecision = decide(average, threshold);
  return (
    <div
      className="relative overflow-hidden rounded-2xl text-white shadow-lg"
      style={{
        background:
          "linear-gradient(135deg, var(--school-accent-1) 0%, var(--school-accent-2, #0d9488) 55%, #0f766e 100%)",
      }}
    >
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
      <div className="absolute -left-10 -bottom-16 h-40 w-40 rounded-full bg-white/10" />
      <div className="relative p-6 sm:p-8 grid lg:grid-cols-[1fr_auto] gap-8 items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-2">Tableau de bord</p>
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h3>
          <div className="flex flex-wrap gap-2 mt-3">
            {yearName ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/15">{yearName}</span>
            ) : null}
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/15">
              {periodName || "Toutes périodes"}
            </span>
          </div>
          <div className="mt-8 flex flex-wrap gap-10">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/70">Moyenne</p>
              <p className="text-5xl sm:text-6xl font-bold tabular-nums leading-none mt-1">
                {fmt(average)}
                <span className="text-lg font-medium text-white/70 ml-1">/10</span>
              </p>
              {avgDecision ? (
                <p className="text-sm mt-2 text-white/85">{DECISION_META[avgDecision].label}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/70">Admis</p>
              <p className="text-5xl sm:text-6xl font-bold tabular-nums leading-none mt-1">
                {admisRate != null ? fmt(admisRate, 0) : "—"}
                {admisRate != null ? <span className="text-lg font-medium text-white/70 ml-1">%</span> : null}
              </p>
              {threshold ? (
                <p className="text-sm mt-2 text-white/85">seuil {fmt(threshold.min_average_admis, 1)}/10</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-5 justify-self-end">
          <DecisionDonut decisions={decisions} />
          {total > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {DECISION_ORDER.filter((k) => (decisions?.[k] || 0) > 0).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DECISION_META[k].color }} />
                  <span className="text-white/90">{DECISION_META[k].label}</span>
                  <span className="tabular-nums font-semibold ml-auto pl-4">{decisions?.[k]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/70">Aucune moyenne encore</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionDonut({ decisions }: { decisions: DecisionCounts | undefined }) {
  const total = decisionTotal(decisions);
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const slices = DECISION_ORDER.map((k) => ({
    key: k,
    n: decisions?.[k] || 0,
    color: DECISION_META[k].color,
  })).filter((s) => s.n > 0);

  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="16" />
        {total > 0
          ? slices.map((s) => {
              const len = (s.n / total) * c;
              const el = (
                <circle
                  key={s.key}
                  cx="70"
                  cy="70"
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="16"
                  strokeLinecap="butt"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              );
              offset += len;
              return el;
            })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{total || "—"}</span>
        <span className="text-[10px] uppercase tracking-wider text-white/70">total</span>
      </div>
    </div>
  );
}

function StackedBar({ decisions }: { decisions: DecisionCounts | undefined }) {
  const total = decisionTotal(decisions);
  return (
    <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-slate-100 flex">
      {total === 0 ? null : DECISION_ORDER.map((k) => {
        const n = decisions?.[k] || 0;
        if (!n) return null;
        return (
          <div
            key={k}
            className="h-full"
            style={{ width: `${(n / total) * 100}%`, backgroundColor: DECISION_META[k].color }}
          />
        );
      })}
    </div>
  );
}

function DecisionLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-slate-500">
      {DECISION_ORDER.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DECISION_META[k].color }} />
          {DECISION_META[k].label}
        </span>
      ))}
    </div>
  );
}

function VerticalBars({
  rows,
}: {
  rows: { id: string; label: string; value: number | null; color: string; onClick?: () => void }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Aucune donnée pour ces filtres.</p>;
  }
  const dataMax = Math.max(0, ...rows.map((r) => r.value ?? 0));
  const scale = dataMax > 10 ? dataMax : 10;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = Math.max(8, ((r.value ?? 0) / scale) * 100);
        return (
          <button
            key={r.id}
            type="button"
            onClick={r.onClick}
            className="w-full flex items-center gap-3 text-left group"
          >
            <div className="relative flex-1 min-w-0 rounded-lg bg-slate-100">
              <div
                className="absolute inset-y-0 left-0 rounded-lg transition-opacity group-hover:opacity-90"
                style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: r.color }}
              />
              <span className="relative z-10 px-2.5 py-1.5 block text-xs font-medium text-slate-900 leading-snug">
                {r.label}
              </span>
            </div>
            <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
              {fmt(r.value, 1)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-5 rounded-2xl border border-[var(--app-border)] bg-white shadow-sm overflow-x-auto">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-white shadow-sm">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  k: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
  align?: "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`py-2 pr-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-slate-800">
        {label}
        <span className={`text-[10px] ${active ? "text-slate-700" : "text-slate-300"}`}>
          {active ? (sortDir === "desc" ? "▼" : "▲") : "↕"}
        </span>
      </button>
    </th>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="py-6 text-center text-slate-400">Aucune donnée pour ces filtres.</td>
    </tr>
  );
}

function ComparisonCard({
  title,
  rows,
  threshold,
  classThresholdById,
}: {
  title: string;
  rows: { id: string; label: string; average: number | null; onClick?: () => void }[];
  threshold?: ClassThreshold;
  classThresholdById?: Record<string, ClassThreshold>;
}) {
  const max = Math.max(...rows.map((r) => r.average ?? 0), 10);
  return (
    <div className="p-5 rounded-2xl border border-[var(--app-border)] bg-white shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900 mb-3">{title}</h4>
      <div className="space-y-2">
        {rows.map((r) => {
          const t = classThresholdById?.[r.id] ?? threshold;
          return (
            <button
              key={r.id}
              type="button"
              onClick={r.onClick}
              className="w-full flex items-center gap-3 text-sm text-left"
            >
              <span className="w-40 shrink-0 text-slate-700 truncate">{r.label}</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${((r.average ?? 0) / max) * 100}%`,
                    backgroundColor: barColor(r.average, t),
                  }}
                />
              </div>
              <span className={`w-12 text-right font-semibold tabular-nums ${avgText(r.average, t)}`}>{fmt(r.average)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StudentRows({
  rows,
  classThresholdById,
  fallback,
}: {
  rows: {
    id: string;
    name: string;
    class_id?: string | null;
    class_name: string | null;
    room_name?: string | null;
    average: number;
    decision?: DecisionKind;
  }[];
  classThresholdById: Record<string, ClassThreshold>;
  fallback?: ClassThreshold;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-3">—</p>;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => {
          const t = (r.class_id && classThresholdById[r.class_id]) || fallback;
          const d = r.decision ?? decide(r.average, t);
          return (
            <tr key={r.id} className="border-b border-slate-50">
              <td className="py-2 pr-2 text-slate-400 w-6 tabular-nums">{i + 1}</td>
              <td className="py-2 pr-2 font-medium text-slate-900">{r.name}</td>
              <td className="py-2 pr-2 text-slate-500">
                {r.class_name ?? "—"}
                {r.room_name ? ` · ${r.room_name}` : ""}
              </td>
              <td className="py-2 pr-2 text-right">
                {d ? (
                  <span
                    className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${DECISION_META[d].color}33`, color: DECISION_META[d].color }}
                  >
                    {DECISION_META[d].label}
                  </span>
                ) : null}
              </td>
              <td className={`py-2 text-right font-semibold tabular-nums ${avgText(r.average, t)}`}>{fmt(r.average)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
