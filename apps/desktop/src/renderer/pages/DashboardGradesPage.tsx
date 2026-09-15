import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { AppAccordion } from "@/components/AppAccordion";
import { isTeacherRole } from "@/lib/dashboardRoles";
import { BAREME_PRESETS, DEFAULT_BAREME, pointsToTen } from "@/lib/gradeScale";
import {
  PRESCHOOL_EVAL_FREQUENCY,
  PRESCHOOL_EVAL_LEVEL,
  PRESCHOOL_FREQUENCIES,
  PRESCHOOL_LEVELS,
  YEAR_END_DECISIONS,
  preschoolFrequencyLabel,
  preschoolLevelLabel,
} from "@/lib/preschoolScale";

type AcademicYear = { id: string; name: string };
type ClassItem = { id: string; name: string; description?: string | null; level?: string | null; is_preschool: boolean };
type Subject = { id: string; name: string };
type Period = { id: string; name: string; order_index: number };

type FormDataRow = {
  student_id: string;
  student_name: string;
  coefficient?: number;
  grade_value?: number | null;
  detail?: string;
  grade_id?: string | null;
};
type PreschoolFormDataRow = {
  student_id: string;
  student_name: string;
  level: string | null;
  frequency: string | null;
  observation: string;
  grade_id: string | null;
  assignment_id: string | null;
  decision: string | null;
};
type CoefficientItem = {
  id: string;
  academic_year_id: string;
  academic_year_name: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  coefficient: number;
  created_at?: string;
};
type ThresholdItem = {
  id: string;
  academic_year_id: string;
  academic_year_name: string;
  class_id: string;
  class_name: string;
  min_average_admis: number;
  min_average_admis_ailleurs: number;
  min_average_redoubler: number;
  min_average_ajourne: number;
};

const FIELD = "class-input w-full";

export function DashboardGradesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);

  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [teacher, setTeacher] = useState<{ id: number; name: string } | null>(null);
  const [defaultCoefficient, setDefaultCoefficient] = useState<number | null>(null);
  const [rows, setRows] = useState<FormDataRow[]>([]);
  const [preschoolRows, setPreschoolRows] = useState<PreschoolFormDataRow[]>([]);
  const [evalMode, setEvalMode] = useState<"LEVEL" | "FREQUENCY">("LEVEL");
  const [isLastPeriod, setIsLastPeriod] = useState(false);
  const [openBlock, setOpenBlock] = useState<"saisie" | "thresholds" | "coefficients">("saisie");
  const [saving, setSaving] = useState(false);

  const [coefficients, setCoefficients] = useState<CoefficientItem[]>([]);
  const [coefAcademicYearId, setCoefAcademicYearId] = useState("");
  const [coefFilterClass, setCoefFilterClass] = useState("");
  const [classSubjects, setClassSubjects] = useState<Subject[]>([]);
  const [coefForm, setCoefForm] = useState({ class_id: "", subject_id: "", coefficient: String(DEFAULT_BAREME) });
  const [coefSaving, setCoefSaving] = useState(false);
  const [coefLoading, setCoefLoading] = useState(false);

  const [thresholds, setThresholds] = useState<ThresholdItem[]>([]);
  const [thresholdAcademicYearId, setThresholdAcademicYearId] = useState("");
  const [thresholdFilterClass, setThresholdFilterClass] = useState("");
  const [thresholdForm, setThresholdForm] = useState({
    class_id: "",
    min_average_admis: "10",
    min_average_admis_ailleurs: "8",
    min_average_redoubler: "6",
    min_average_ajourne: "4",
  });
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdLoading, setThresholdLoading] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<ClassItem[]>([]);
  const [teacherSubjectsInClass, setTeacherSubjectsInClass] = useState<Subject[]>([]);
  const [canEditGrades, setCanEditGrades] = useState(true);

  async function loadAcademicYearsAndClasses() {
    setError("");
    try {
      const [yearsRes, classesRes, subjectsRes, ctxRes, meRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/subjects`),
        fetchWithAuth(`${API_BASE}/school/current-context`),
        fetchWithAuth(`${API_BASE}/users/me`),
      ]);
      const yearsData = await yearsRes.json();
      const classesData = await classesRes.json();
      const subjectsData = await subjectsRes.json();
      const ctxData = await ctxRes.json();
      const meData = meRes.ok ? await meRes.json() : {};
      if (!yearsRes.ok) throw new Error(yearsData.message || "Erreur années");
      if (!classesRes.ok) throw new Error(classesData.message || "Erreur classes");
      if (!subjectsRes.ok) throw new Error(subjectsData.message || "Erreur matières");
      setAcademicYears(yearsData.academic_years ?? []);
      setClasses(classesData.classes ?? []);
      setSubjects(subjectsData.subjects ?? []);
      setCurrentUserRole(meData.user?.role ?? null);
      const years = yearsData.academic_years ?? [];
      if (years.length > 0) {
        const defaultYearId = ctxRes.ok && ctxData.current_academic_year_id && years.some((y: AcademicYear) => y.id === ctxData.current_academic_year_id)
          ? ctxData.current_academic_year_id
          : years[0].id;
        setAcademicYearId((prev) => (prev === "" ? defaultYearId : prev));
      }
      if (isTeacherRole(meData.user?.role)) {
        const tcRes = await fetchWithAuth(`${API_BASE}/teachers/me/classes`);
        const tcData = tcRes.ok ? await tcRes.json() : {};
        const tClasses = (tcData.classes ?? []).map((c: { id: string; name: string; level?: string | null; is_preschool?: boolean }) => ({
          id: c.id,
          name: c.name,
          level: c.level,
          is_preschool: !!c.is_preschool,
        }));
        setTeacherClasses(tClasses);
      } else {
        setTeacherClasses([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement");
    }
  }

  async function loadPeriods() {
    if (!academicYearId) {
      setPeriods([]);
      return;
    }
    try {
      const [periodsRes, ctxRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/periods?academic_year_id=${academicYearId}`),
        fetchWithAuth(`${API_BASE}/school/current-context`),
      ]);
      const data = await periodsRes.json();
      const ctxData = await ctxRes.json();
      if (!periodsRes.ok) throw new Error(data.message || "Erreur");
      const list = (data.periods ?? []).sort((a: Period, b: Period) => (a.order_index ?? 0) - (b.order_index ?? 0));
      setPeriods(list);
      if (list.length > 0) {
        const defaultPeriodId = ctxRes.ok && ctxData.current_period_id && list.some((p: Period) => p.id === ctxData.current_period_id)
          ? ctxData.current_period_id
          : list[0].id;
        setPeriodId((prev) => (prev === "" ? defaultPeriodId : prev));
      }
    } catch {
      setPeriods([]);
    }
  }

  useEffect(() => {
    loadAcademicYearsAndClasses().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [academicYearId]);

  useEffect(() => {
    if (academicYears.length > 0 && !coefAcademicYearId) {
      setCoefAcademicYearId(academicYears[0].id);
    }
  }, [academicYears.length, coefAcademicYearId]);

  useEffect(() => {
    if (academicYears.length > 0 && !thresholdAcademicYearId) {
      setThresholdAcademicYearId(academicYears[0].id);
    }
  }, [academicYears.length, thresholdAcademicYearId]);

  async function loadThresholds() {
    if (!thresholdAcademicYearId) {
      setThresholds([]);
      return;
    }
    setThresholdLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("academic_year_id", thresholdAcademicYearId);
      if (thresholdFilterClass) params.set("class_id", thresholdFilterClass);
      const res = await fetchWithAuth(`${API_BASE}/formation-classe/thresholds?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setThresholds(data.thresholds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setThresholds([]);
    } finally {
      setThresholdLoading(false);
    }
  }

  useEffect(() => {
    loadThresholds();
  }, [thresholdAcademicYearId, thresholdFilterClass]);

  function handleEditThreshold(t: ThresholdItem) {
    setThresholdAcademicYearId(t.academic_year_id);
    setThresholdForm({
      class_id: t.class_id,
      min_average_admis: String(t.min_average_admis),
      min_average_admis_ailleurs: String(t.min_average_admis_ailleurs),
      min_average_redoubler: String(t.min_average_redoubler),
      min_average_ajourne: String(t.min_average_ajourne),
    });
  }

  async function handleSaveThreshold(e: React.FormEvent) {
    e.preventDefault();
    if (!thresholdAcademicYearId || !thresholdForm.class_id) return;
    const admis = parseFloat(thresholdForm.min_average_admis);
    const admisAilleurs = parseFloat(thresholdForm.min_average_admis_ailleurs);
    const redoubler = parseFloat(thresholdForm.min_average_redoubler);
    const ajourne = parseFloat(thresholdForm.min_average_ajourne);
    if ([admis, admisAilleurs, redoubler, ajourne].some((n) => isNaN(n))) return;
    setThresholdSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/formation-classe/thresholds`, {
        method: "POST",
        body: JSON.stringify({
          academic_year_id: thresholdAcademicYearId,
          class_id: thresholdForm.class_id,
          min_average_admis: admis,
          min_average_admis_ailleurs: admisAilleurs,
          min_average_redoubler: redoubler,
          min_average_ajourne: ajourne,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      loadThresholds();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setThresholdSaving(false);
    }
  }

  async function loadClassSubjects(classId: string) {
    if (!classId) {
      setClassSubjects([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes/${classId}/subjects`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setClassSubjects(data.subjects ?? []);
    } catch {
      setClassSubjects([]);
    }
  }

  useEffect(() => {
    if (coefForm.class_id) {
      loadClassSubjects(coefForm.class_id);
    } else {
      setClassSubjects([]);
      setCoefForm((f) => ({ ...f, subject_id: "" }));
    }
  }, [coefForm.class_id]);

  async function loadCoefficients() {
    if (!coefAcademicYearId) {
      setCoefficients([]);
      return;
    }
    setCoefLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("academic_year_id", coefAcademicYearId);
      if (coefFilterClass) params.set("class_id", coefFilterClass);
      const res = await fetchWithAuth(`${API_BASE}/grades/coefficients?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setCoefficients(data.coefficients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setCoefficients([]);
    } finally {
      setCoefLoading(false);
    }
  }

  useEffect(() => {
    loadCoefficients();
  }, [coefAcademicYearId, coefFilterClass]);

  function handleEditCoefficient(c: CoefficientItem) {
    setCoefAcademicYearId(c.academic_year_id);
    setCoefForm({ class_id: c.class_id, subject_id: c.subject_id, coefficient: String(c.coefficient) });
    loadClassSubjects(c.class_id);
  }

  async function handleSaveCoefficient(e: React.FormEvent) {
    e.preventDefault();
    if (!coefAcademicYearId || !coefForm.class_id || !coefForm.subject_id) return;
    const coef = parseFloat(coefForm.coefficient);
    if (isNaN(coef) || coef < 0) return;
    setCoefSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/grades/coefficients`, {
        method: "POST",
        body: JSON.stringify({
          academic_year_id: coefAcademicYearId,
          class_id: coefForm.class_id,
          subject_id: coefForm.subject_id,
          coefficient: coef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setCoefForm((f) => ({ ...f, coefficient: String(coef) }));
      loadCoefficients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCoefSaving(false);
    }
  }

  useEffect(() => {
    setSelectedClass(
      classes.find((c) => c.id === classId) ??
        teacherClasses.find((c) => c.id === classId) ??
        null,
    );
  }, [classId, classes, teacherClasses]);

  useEffect(() => {
    if (!isTeacherRole(currentUserRole) || !classId) {
      setTeacherSubjectsInClass([]);
      return;
    }
    fetchWithAuth(`${API_BASE}/teachers/me/classes/${classId}/subjects`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.subjects ?? [];
        setTeacherSubjectsInClass(list);
        setSubjectId((prev) => (list.some((s: Subject) => s.id === prev) ? prev : ""));
      })
      .catch(() => setTeacherSubjectsInClass([]));
  }, [currentUserRole, classId]);

  useEffect(() => {
    if (!academicYearId || !classId || !subjectId || !periodId) {
      setTeacher(null);
      setDefaultCoefficient(null);
      setRows([]);
      setPreschoolRows([]);
      setIsLastPeriod(false);
      return;
    }
    const isPreschool = selectedClass?.is_preschool ?? false;
    setFormLoading(true);
    setError("");
    const url = isPreschool
      ? `${API_BASE}/grades/preschool/form-data?academic_year_id=${academicYearId}&class_id=${classId}&subject_id=${subjectId}&period_id=${periodId}`
      : `${API_BASE}/grades/form-data?academic_year_id=${academicYearId}&class_id=${classId}&subject_id=${subjectId}&period_id=${periodId}`;
    fetchWithAuth(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.message && !data.teacher && !data.rows) throw new Error(data.message);
        setTeacher(data.teacher ?? null);
        setCanEditGrades(data.can_edit !== false);
        if (!isPreschool) {
          setDefaultCoefficient(data.default_coefficient ?? null);
          setRows(data.rows ?? []);
          setPreschoolRows([]);
          setIsLastPeriod(false);
        } else {
          setDefaultCoefficient(null);
          setRows([]);
          setPreschoolRows(
            (data.rows ?? []).map((r: PreschoolFormDataRow) => ({
              ...r,
              assignment_id: r.assignment_id ?? null,
              decision: r.decision ?? null,
            })),
          );
          setEvalMode(data.eval_mode === "FREQUENCY" ? "FREQUENCY" : "LEVEL");
          setIsLastPeriod(!!data.is_last_period);
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Erreur");
        setRows([]);
        setPreschoolRows([]);
      })
      .finally(() => setFormLoading(false));
  }, [academicYearId, classId, subjectId, periodId, selectedClass?.is_preschool]);

  async function handleSaveGrades(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditGrades || !academicYearId || !classId || !subjectId || !periodId) return;
    const isPreschool = selectedClass?.is_preschool ?? false;
    setSaving(true);
    setError("");
    try {
      const url = isPreschool ? `${API_BASE}/grades/preschool/save` : `${API_BASE}/grades/save`;
      const body = isPreschool
        ? {
            academic_year_id: academicYearId,
            class_id: classId,
            subject_id: subjectId,
            period_id: periodId,
            grades: preschoolRows.map((r) => ({
              student_id: r.student_id,
              level: evalMode === "LEVEL" ? r.level?.trim() || undefined : undefined,
              frequency: evalMode === "FREQUENCY" ? r.frequency?.trim() || undefined : undefined,
              observation: r.observation?.trim() || undefined,
            })),
            ...(isLastPeriod
              ? {
                  decisions: preschoolRows.map((r) => ({
                    assignment_id: r.assignment_id,
                    decision: r.decision || null,
                  })),
                }
              : {}),
          }
        : {
            academic_year_id: academicYearId,
            class_id: classId,
            subject_id: subjectId,
            period_id: periodId,
            grades: rows.map((r) => ({
              student_id: r.student_id,
              coefficient: bareme,
              grade_value: r.grade_value,
              detail: r.detail?.trim() || undefined,
            })),
          };
      const res = await fetchWithAuth(url, { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur enregistrement");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const bareme = defaultCoefficient ?? DEFAULT_BAREME;

  async function applyBareme(value: number) {
    if (!academicYearId || !classId || !subjectId || !canEditGrades) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/grades/coefficients`, {
        method: "POST",
        body: JSON.stringify({
          academic_year_id: academicYearId,
          class_id: classId,
          subject_id: subjectId,
          coefficient: value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur barème");
      setDefaultCoefficient(value);
      setRows((prev) => prev.map((row) => ({ ...row, coefficient: value })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur barème");
    }
  }

  async function applyEvalMode(mode: "LEVEL" | "FREQUENCY") {
    if (!subjectId) return;
    setEvalMode(mode);
    try {
      await fetchWithAuth(`${API_BASE}/subjects/${subjectId}`, {
        method: "PATCH",
        body: JSON.stringify({ preschool_eval: mode }),
      });
    } catch {
      /* the local toggle still applies for this session */
    }
  }

  const isPreschool = selectedClass?.is_preschool ?? false;
  const canLoadForm = academicYearId && classId && subjectId && periodId;
  const isTeacher = isTeacherRole(currentUserRole);
  const classesForSaisie = isTeacher ? teacherClasses : classes;
  const subjectsForSaisie = isTeacher ? teacherSubjectsInClass : subjects;
  const subjectName = subjectsForSaisie.find((s) => s.id === subjectId)?.name ?? subjects.find((s) => s.id === subjectId)?.name ?? "";
  const periodName = periods.find((p) => p.id === periodId)?.name ?? "";

  if (loading) {
    return <div className="animate-pulse text-slate-500">Chargement...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Pédagogie</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Saisie des notes</h2>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
      ) : null}

      <AppAccordion
        title="Saisie"
        tone="teal"
        open={openBlock === "saisie"}
        onToggle={() => setOpenBlock("saisie")}
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Année</span>
            <select
              value={academicYearId}
              onChange={(e) => { setAcademicYearId(e.target.value); setPeriodId(""); }}
              className={FIELD}
            >
              <option value="">Sélectionner</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Classe</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className={FIELD}
            >
              <option value="">Sélectionner</option>
              {classesForSaisie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{"is_preschool" in c && c.is_preschool ? " (préscolaire)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Matière</span>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className={FIELD}
              disabled={isTeacher && !classId}
            >
              <option value="">Sélectionner</option>
              {isTeacher && classId && teacherSubjectsInClass.length === 0 ? (
                <option value="" disabled>Aucune matière dans cette classe</option>
              ) : (
                subjectsForSaisie.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
              )}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Période</span>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className={FIELD}
            >
              <option value="">Sélectionner</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>

      {canLoadForm ? (
        <>
          {formLoading ? (
            <div className="p-8 text-center text-slate-500">Chargement...</div>
          ) : (
            <form onSubmit={handleSaveGrades} className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-slate-800">
                    {subjectName}{periodName ? ` · ${periodName}` : ""}
                    {teacher ? ` · ${teacher.name}` : ""}
                  </p>
                  {isPreschool ? (
                    <div className="inline-flex rounded-full bg-white p-1 ring-1 ring-slate-200">
                      <button
                        type="button"
                        onClick={() => void applyEvalMode(PRESCHOOL_EVAL_LEVEL)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          evalMode === "LEVEL" ? "bg-teal-700 text-white" : "text-slate-600"
                        }`}
                      >
                        Niveau
                      </button>
                      <button
                        type="button"
                        onClick={() => void applyEvalMode(PRESCHOOL_EVAL_FREQUENCY)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          evalMode === "FREQUENCY" ? "bg-teal-700 text-white" : "text-slate-600"
                        }`}
                      >
                        Fréquence
                      </button>
                    </div>
                  ) : null}
                </div>
                {canEditGrades ? (
                  <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
                    {saving ? "Enregistrement..." : isPreschool && isLastPeriod ? "Enregistrer" : "Enregistrer les notes"}
                  </button>
                ) : (
                  <p className="text-sm font-medium text-amber-700">Déjà enregistré</p>
                )}
              </div>

              {!isPreschool && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-sm font-medium text-slate-800">Note sur</span>
                  {BAREME_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!canEditGrades}
                      onClick={() => applyBareme(n)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                        bareme === n
                          ? "border-transparent bg-[var(--school-accent-1)] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      } disabled:opacity-50`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {isPreschool ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                        {evalMode === "LEVEL" ? (
                          <th className="px-4 py-3 font-medium text-slate-900 w-44">Niveau</th>
                        ) : (
                          <th className="px-4 py-3 font-medium text-slate-900 w-44">Fréquence</th>
                        )}
                        <th className="px-4 py-3 font-medium text-slate-900">Observation</th>
                        {isLastPeriod ? (
                          <th className="px-4 py-3 font-medium text-slate-900 w-48">Décision</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {preschoolRows.length === 0 ? (
                        <tr><td colSpan={isLastPeriod ? 4 : 3} className="px-4 py-8 text-center text-slate-500">Aucun élève dans cette classe</td></tr>
                      ) : (
                        preschoolRows.map((r) => (
                          <tr key={r.student_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-900">{r.student_name}</td>
                            {evalMode === "LEVEL" ? (
                              <td className="px-4 py-2">
                                <select
                                  value={r.level ?? ""}
                                  onChange={(e) => setPreschoolRows((prev) => prev.map((row) => row.student_id === r.student_id ? { ...row, level: e.target.value || null } : row))}
                                  className={FIELD}
                                  disabled={!canEditGrades}
                                >
                                  <option value="">—</option>
                                  {r.level && !PRESCHOOL_LEVELS.some((o) => o.value === r.level) ? (
                                    <option value={r.level}>{preschoolLevelLabel(r.level)}</option>
                                  ) : null}
                                  {PRESCHOOL_LEVELS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                            ) : (
                              <td className="px-4 py-2">
                                <select
                                  value={r.frequency ?? ""}
                                  onChange={(e) => setPreschoolRows((prev) => prev.map((row) => row.student_id === r.student_id ? { ...row, frequency: e.target.value || null } : row))}
                                  className={FIELD}
                                  disabled={!canEditGrades}
                                >
                                  <option value="">—</option>
                                  {r.frequency && !PRESCHOOL_FREQUENCIES.some((o) => o.value === r.frequency) ? (
                                    <option value={r.frequency}>{preschoolFrequencyLabel(r.frequency)}</option>
                                  ) : null}
                                  {PRESCHOOL_FREQUENCIES.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={r.observation}
                                onChange={(e) => setPreschoolRows((prev) => prev.map((row) => row.student_id === r.student_id ? { ...row, observation: e.target.value } : row))}
                                className={FIELD}
                                disabled={!canEditGrades}
                              />
                            </td>
                            {isLastPeriod ? (
                              <td className="px-4 py-2">
                                <select
                                  value={r.decision ?? ""}
                                  onChange={(e) => setPreschoolRows((prev) => prev.map((row) => row.student_id === r.student_id ? { ...row, decision: e.target.value || null } : row))}
                                  className={FIELD}
                                  disabled={!canEditGrades}
                                >
                                  <option value="">—</option>
                                  {YEAR_END_DECISIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                            ) : null}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                      <tr>
                        <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                        <th className="px-4 py-3 font-medium text-slate-900 w-48">Points obtenus / {bareme}</th>
                        <th className="px-4 py-3 font-medium text-slate-900 w-24">/10</th>
                        <th className="px-4 py-3 font-medium text-slate-900">Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Aucun élève dans cette classe</td></tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.student_id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-900">{r.student_name}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={r.grade_value ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setRows((prev) => prev.map((row) => row.student_id === r.student_id ? { ...row, grade_value: v === "" ? null : parseFloat(v) } : row));
                                  }}
                                  placeholder="ex. 180"
                                  className="w-full border border-[var(--app-border)] rounded px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:cursor-not-allowed"
                                  disabled={!canEditGrades}
                                />
                                <span className="text-slate-500 text-sm whitespace-nowrap">/ {bareme}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 tabular-nums font-semibold text-slate-800">
                              {pointsToTen(r.grade_value ?? null, bareme)?.toFixed(2) ?? "—"}
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={r.detail ?? ""}
                                onChange={(e) => setRows((prev) => prev.map((row) => row.student_id === r.student_id ? { ...row, detail: e.target.value } : row))}
                                placeholder="Optionnel"
                                className="w-full border border-[var(--app-border)] rounded px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:cursor-not-allowed"
                                disabled={!canEditGrades}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </form>
          )}
        </>
      ) : null}
      </AppAccordion>

      {classes.some((c) => !c.is_preschool) ? (
        <>
          <AppAccordion
            title="Seuils de fin d'année"
            open={openBlock === "thresholds"}
            onToggle={() => setOpenBlock("thresholds")}
          >
            <form onSubmit={handleSaveThreshold} className="space-y-4 mb-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Année académique</label>
                  <select
                    value={thresholdAcademicYearId}
                    onChange={(e) => setThresholdAcademicYearId(e.target.value)}
                    className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[160px]"
                    required
                  >
                    <option value="">Sélectionner</option>
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                  <select
                    value={thresholdForm.class_id}
                    onChange={(e) => setThresholdForm((f) => ({ ...f, class_id: e.target.value }))}
                    className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[160px]"
                    required
                  >
                    <option value="">Sélectionner</option>
                    {classes.filter((c) => !c.is_preschool).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Admis (min. moyenne /10)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={thresholdForm.min_average_admis}
                    onChange={(e) => setThresholdForm((f) => ({ ...f, min_average_admis: e.target.value }))}
                    className="border border-[var(--app-border)] rounded-lg px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Admis ailleurs (min. /10)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={thresholdForm.min_average_admis_ailleurs}
                    onChange={(e) => setThresholdForm((f) => ({ ...f, min_average_admis_ailleurs: e.target.value }))}
                    className="border border-[var(--app-border)] rounded-lg px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Redoubler (min. /10)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={thresholdForm.min_average_redoubler}
                    onChange={(e) => setThresholdForm((f) => ({ ...f, min_average_redoubler: e.target.value }))}
                    className="border border-[var(--app-border)] rounded-lg px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ajourné (min. /10)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={thresholdForm.min_average_ajourne}
                    onChange={(e) => setThresholdForm((f) => ({ ...f, min_average_ajourne: e.target.value }))}
                    className="border border-[var(--app-border)] rounded-lg px-3 py-2 w-full"
                  />
                </div>
              </div>
              <button type="submit" disabled={thresholdSaving || !thresholdAcademicYearId} className="app-btn-primary disabled:opacity-60">
                {thresholdSaving ? "Enregistrement..." : "Enregistrer les seuils"}
              </button>
            </form>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="font-medium text-slate-900">Seuils définis</h4>
                {thresholds.length > 0 && (
                  <ExportPdfButton
                    table={{
                      title: "Seuils de décision de fin d'année",
                      subtitle: academicYears.find((y) => y.id === thresholdAcademicYearId)?.name,
                      columns: [
                        { header: "Année", key: "academic_year_name" },
                        { header: "Classe", key: "class_name" },
                        { header: "Admis (min.)", key: "min_average_admis" },
                        { header: "Admis ailleurs (min.)", key: "min_average_admis_ailleurs" },
                        { header: "Redoubler (min.)", key: "min_average_redoubler" },
                        { header: "Ajourné (min.)", key: "min_average_ajourne" },
                      ],
                      rows: thresholds.map((t) => ({
                        academic_year_name: t.academic_year_name,
                        class_name: t.class_name,
                        min_average_admis: t.min_average_admis,
                        min_average_admis_ailleurs: t.min_average_admis_ailleurs,
                        min_average_redoubler: t.min_average_redoubler,
                        min_average_ajourne: t.min_average_ajourne,
                      })),
                    }}
                    filename="seuils-decision-fin-annee.pdf"
                    label="Exporter en PDF"
                    className="text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-3 mb-3">
                <select
                  value={thresholdFilterClass}
                  onChange={(e) => setThresholdFilterClass(e.target.value)}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Toutes les classes</option>
                  {classes.filter((c) => !c.is_preschool).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {thresholdLoading ? (
                <p className="text-slate-500 text-sm py-4">Chargement...</p>
              ) : thresholds.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">Aucun seuil défini</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                      <tr>
                        <th className="px-4 py-2 font-medium text-slate-900">Année</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Classe</th>
                        <th className="px-4 py-2 font-medium text-slate-900 w-20">Admis</th>
                        <th className="px-4 py-2 font-medium text-slate-900 w-20">Admis ailleurs</th>
                        <th className="px-4 py-2 font-medium text-slate-900 w-20">Redoubler</th>
                        <th className="px-4 py-2 font-medium text-slate-900 w-20">Ajourné</th>
                        <th className="px-4 py-2 font-medium text-slate-900 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thresholds.map((t) => (
                        <tr key={t.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                          <td className="px-4 py-2 text-slate-700">{t.academic_year_name}</td>
                          <td className="px-4 py-2 text-slate-700">{t.class_name}</td>
                          <td className="px-4 py-2 font-medium text-slate-900">{t.min_average_admis}</td>
                          <td className="px-4 py-2 font-medium text-slate-900">{t.min_average_admis_ailleurs}</td>
                          <td className="px-4 py-2 font-medium text-slate-900">{t.min_average_redoubler}</td>
                          <td className="px-4 py-2 font-medium text-slate-900">{t.min_average_ajourne}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => handleEditThreshold(t)}
                              className="text-[var(--school-accent-1)] hover:underline text-xs"
                            >
                              Modifier
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </AppAccordion>

          <AppAccordion
            title="Barème des matières"
            open={openBlock === "coefficients"}
            onToggle={() => setOpenBlock("coefficients")}
          > 
            <form onSubmit={handleSaveCoefficient} className="flex flex-wrap gap-4 items-end mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Année académique</label>
                <select
                  value={coefAcademicYearId}
                  onChange={(e) => setCoefAcademicYearId(e.target.value)}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[160px]"
                  required
                >
                  <option value="">Sélectionner</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                <select
                  value={coefForm.class_id}
                  onChange={(e) => setCoefForm((f) => ({ ...f, class_id: e.target.value, subject_id: "" }))}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[160px]"
                  required
                >
                  <option value="">Sélectionner</option>
                  {classes.filter((c) => !c.is_preschool).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Matière</label>
                <select
                  value={coefForm.subject_id}
                  onChange={(e) => setCoefForm((f) => ({ ...f, subject_id: e.target.value }))}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 min-w-[160px]"
                  required
                  disabled={!coefForm.class_id}
                >
                  <option value="">{coefForm.class_id ? "Sélectionner" : "Choisir une classe d'abord"}</option>
                  {classSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note sur</label>
                <div className="flex items-center gap-2">
                  {BAREME_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCoefForm((f) => ({ ...f, coefficient: String(n) }))}
                      className={`px-2.5 py-1.5 rounded-lg text-sm font-semibold border ${
                        coefForm.coefficient === String(n)
                          ? "bg-[var(--school-accent-1)] text-white border-transparent"
                          : "bg-white text-slate-700 border-[var(--app-border)]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={coefForm.coefficient}
                    onChange={(e) => setCoefForm((f) => ({ ...f, coefficient: e.target.value }))}
                    className="border border-[var(--app-border)] rounded-lg px-3 py-2 w-24"
                    required
                  />
                </div>
              </div>
              <button type="submit" disabled={coefSaving || !coefAcademicYearId} className="app-btn-primary disabled:opacity-60">
                {coefSaving ? "Enregistrement..." : "Enregistrer le coefficient"}
              </button>
            </form>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="font-medium text-slate-900">Coefficients définis</h4>
                {coefficients.length > 0 && (
                  <ExportPdfButton
                    table={{
                      title: "Coefficients par classe et matière",
                      subtitle: academicYears.find((y) => y.id === coefAcademicYearId)?.name,
                      columns: [
                        { header: "Année", key: "academic_year_name" },
                        { header: "Classe", key: "class_name" },
                        { header: "Matière", key: "subject_name" },
                        { header: "Note sur", key: "coefficient" },
                      ],
                      rows: coefficients.map((c) => ({
                        academic_year_name: c.academic_year_name,
                        class_name: c.class_name,
                        subject_name: c.subject_name,
                        coefficient: c.coefficient,
                      })),
                    }}
                    filename="coefficients-matieres.pdf"
                    label="Exporter en PDF"
                    className="text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-3 mb-3">
                <select
                  value={coefFilterClass}
                  onChange={(e) => setCoefFilterClass(e.target.value)}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Toutes les classes</option>
                  {classes.filter((c) => !c.is_preschool).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {coefLoading ? (
                <p className="text-slate-500 text-sm py-4">Chargement...</p>
              ) : coefficients.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">Aucun coefficient défini</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                      <tr>
                        <th className="px-4 py-2 font-medium text-slate-900">Année</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Classe</th>
                        <th className="px-4 py-2 font-medium text-slate-900">Matière</th>
                        <th className="px-4 py-2 font-medium text-slate-900 w-24">Note sur</th>
                        <th className="px-4 py-2 font-medium text-slate-900 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coefficients.map((c) => (
                        <tr key={c.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                          <td className="px-4 py-2 text-slate-700">{c.academic_year_name}</td>
                          <td className="px-4 py-2 text-slate-700">{c.class_name}</td>
                          <td className="px-4 py-2 text-slate-700">{c.subject_name}</td>
                          <td className="px-4 py-2 font-medium text-slate-900">{c.coefficient}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => handleEditCoefficient(c)}
                              className="text-[var(--school-accent-1)] hover:underline text-xs"
                            >
                              Modifier
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </AppAccordion>
        </>
      ) : null}
    </div>
  );
}
