import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { ExportPdfButton } from "@/components/ExportPdfButton";

type AcademicYear = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
};

type ClassItem = {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  section: string | null;
  is_preschool?: boolean;
};

const DECISION_OPTIONS = [
  { value: "ADMIS", label: "Admis" },
  { value: "ADMIS_AILLEURS", label: "Admis ailleurs" },
  { value: "REDOUBLER", label: "Redoubler" },
  { value: "AJOURNE", label: "Ajourné" },
  { value: "RENVOYE_DEFINITIVEMENT", label: "Renvoyé définitivement" },
] as const;

type StudentInClass = {
  id: string;
  first_name: string;
  last_name: string;
  order_number: string | null;
  student_code: string | null;
  decision: string | null;
  average: number | null;
  assignment_id: string | null;
};

export function DashboardFormationClassePage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentInClass[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingDecisionId, setSavingDecisionId] = useState<string | null>(null);
  const [computingDecisions, setComputingDecisions] = useState(false);


  async function loadAcademicYears() {
    setError("");
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
        const defaultId = ctxRes.ok && ctxData.current_academic_year_id && years.some((y: AcademicYear) => y.id === ctxData.current_academic_year_id)
          ? ctxData.current_academic_year_id
          : years[0].id;
        setSelectedYearId((prev) => (prev === "" ? defaultId : prev));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }

  async function loadClasses() {
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setClasses(data.classes ?? []);
      if (!selectedClassId && (data.classes?.length ?? 0) > 0) {
        setSelectedClassId(data.classes[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }

  async function loadStudents() {
    if (!selectedYearId || !selectedClassId) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/formation-classe/students?academic_year_id=${selectedYearId}&class_id=${selectedClassId}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setStudents(data.students ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    await Promise.all([loadAcademicYears(), loadClasses()]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadStudents();
  }, [selectedYearId, selectedClassId]);

  async function handleComputeDecisions() {
    if (!selectedYearId || !selectedClassId || isPreschoolClass) return;
    setComputingDecisions(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/formation-classe/compute-decisions`, {
        method: "POST",
        body: JSON.stringify({ academic_year_id: selectedYearId, class_id: selectedClassId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      loadStudents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setComputingDecisions(false);
    }
  }

  async function handleSetDecision(assignmentId: string | null, decision: string) {
    if (!assignmentId) return;
    setSavingDecisionId(assignmentId);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/formation-classe/assignments/${assignmentId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      loadStudents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingDecisionId(null);
    }
  }

  const selectedYear = academicYears.find((y) => y.id === selectedYearId);
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const isPreschoolClass = selectedClass?.is_preschool ?? false;

  if (loading) {
    return <div className="animate-pulse text-slate-500">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Formation de classe</h2>

      

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-6 p-5 rounded-xl border border-[var(--app-border)] bg-white">
        <div className="min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Année académique
          </label>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          >
            <option value="">— Sélectionner —</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Classe
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          >
            <option value="">— Sélectionner —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.level || c.section
                  ? ` (${[c.level, c.section].filter(Boolean).join(" / ")})`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Liste des élèves */}
      {!selectedYearId || !selectedClassId ? (
        <div className="p-8 rounded-xl border border-[var(--app-border)] bg-slate-50/50 text-center text-slate-500">
          Sélectionnez une année académique et une classe pour afficher les élèves.
        </div>
      ) : studentsLoading ? (
        <div className="animate-pulse p-8 rounded-xl border border-[var(--app-border)] text-slate-500 text-center">
          Chargement des élèves...
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--app-border)] overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-[var(--app-border)]">
            <h3 className="font-semibold text-slate-900">
              Élèves de {selectedClass?.name ?? "la classe"} — {selectedYear?.name ?? "année"}
            </h3>
            <p className="text-sm text-slate-600 mt-0.5">
              {students.length} élève{students.length !== 1 ? "s" : ""} dans cette classe
              {isPreschoolClass && " — Décision manuelle (préscolaire)"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 items-center">
            {students.length > 0 && (
              <ExportPdfButton
                table={{
                  title: `Liste des élèves — ${selectedClass?.name ?? ""}`,
                  subtitle: `${selectedYear?.name ?? ""}`,
                  columns: [
                    { header: "Code école", key: "student_code" },
                    { header: "Nom", key: "last_name" },
                    { header: "Prénom", key: "first_name" },
                    { header: "Moyenne", key: "average" },
                    { header: "Décision", key: "decision_label" },
                  ],
                  rows: students.map((s) => ({
                    student_code: s.student_code ?? "—",
                    last_name: s.last_name,
                    first_name: s.first_name,
                    average: s.average != null ? s.average.toFixed(2) : "—",
                    decision_label: s.decision ? (DECISION_OPTIONS.find((o) => o.value === s.decision)?.label ?? s.decision) : "—",
                  })),
                }}
                filename={`liste-classe-${selectedClass?.name ?? "classe"}-${selectedYear?.name ?? "annee"}.pdf`}
                label="Exporter la liste en PDF"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
              />
            )}
            {!isPreschoolClass && selectedYearId && selectedClassId && (
              <>
                <button
                  type="button"
                  onClick={handleComputeDecisions}
                  disabled={computingDecisions}
                  className="app-btn-primary text-sm disabled:opacity-60"
                >
                  {computingDecisions ? "Calcul..." : "Calculer les décisions automatiquement"}
                </button>
              </>
            )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-900">Code école</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Prénom</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Moyenne</th>
                  <th className="px-4 py-3 font-medium text-slate-900">Décision</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Aucun élève dans cette classe pour cette année.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--app-border)] last:border-b-0 hover:bg-slate-50/50"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {s.student_code ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {s.last_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.first_name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.average != null ? s.average.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isPreschoolClass ? (
                          <select
                            value={s.decision ?? ""}
                            onChange={(e) => handleSetDecision(s.assignment_id, e.target.value)}
                            disabled={!s.assignment_id || savingDecisionId === s.assignment_id}
                            className="border border-[var(--app-border)] rounded px-2 py-1.5 text-sm min-w-[160px]"
                          >
                            <option value="">— Choisir —</option>
                            {DECISION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : s.decision ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              s.decision === "ADMIS"
                                ? "bg-green-100 text-green-800"
                                : s.decision === "ADMIS_AILLEURS"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : s.decision === "REDOUBLER"
                                    ? "bg-amber-100 text-amber-800"
                                    : s.decision === "AJOURNE"
                                      ? "bg-orange-100 text-orange-800"
                                      : s.decision === "RENVOYE_DEFINITIVEMENT" || s.decision === "RENVOYE"
                                        ? "bg-red-100 text-red-800"
                                        : s.decision === "EXPELLED"
                                          ? "bg-red-100 text-red-800"
                                          : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {DECISION_OPTIONS.find((o) => o.value === s.decision)?.label ?? s.decision}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
