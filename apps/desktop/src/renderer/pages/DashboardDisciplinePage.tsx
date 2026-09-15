import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { formatDateJJMMAAAA, getTodayLocalYYYYMMDD } from "@/lib/format";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";

type ClassItem = { id: string; name: string };
type StudentRow = { id: string; first_name: string; last_name: string; status: string | null };
type LatenessItem = {
  id: string;
  student_id: string;
  student_name: string | null;
  class_id: string;
  class_name: string | null;
  date: string;
  arrival_time: string;
  created_at: string;
};
type DeductionItem = {
  id: string;
  student_id: string;
  student_name: string | null;
  points_deducted: number;
  reason: string | null;
  created_at: string;
};
type MeasureItem = {
  id: string;
  student_id: string;
  student_name: string | null;
  measure_type: string;
  label: string;
  color: string;
  reason: string | null;
  created_at: string;
  expires_at?: string | null;
};

const ATTENDANCE_STATUSES = [
  { value: "PRESENT", label: "Présent" },
  { value: "ABSENT", label: "Absent" },
  { value: "EXCUSED", label: "Excusé" },
  { value: "LATE", label: "En retard" },
];

const MEASURE_TYPES = [
  { value: "SOUS_SURVEILLANCE", label: "Sous-surveillance" },
  { value: "EN_RETENUE", label: "En retenue" },
  { value: "RENVOYE_TEMPORAIREMENT", label: "Renvoyé temporairement" },
  { value: "RENVOYE_DEFINITIVEMENT", label: "Renvoyé définitivement" },
];

export function DashboardDisciplinePage() {
  const [tab, setTab] = useState<"appel" | "retards" | "points" | "mesures">("appel");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(getTodayLocalYYYYMMDD());
  const [attendanceStudents, setAttendanceStudents] = useState<StudentRow[]>([]);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const [latenesses, setLatenesses] = useState<LatenessItem[]>([]);
  const [latenessFilterClass, setLatenessFilterClass] = useState("");
  const [latenessFilterDate, setLatenessFilterDate] = useState("");
  const [latenessForm, setLatenessForm] = useState({
    student_id: "",
    class_id: "",
    date: getTodayLocalYYYYMMDD(),
    arrival_time: "08:00",
  });
  const [studentsForLateness, setStudentsForLateness] = useState<{ id: string; first_name: string; last_name: string; order_number: string | null }[]>([]);
  const [latenessSaving, setLatenessSaving] = useState(false);

  const [deductions, setDeductions] = useState<DeductionItem[]>([]);
  const [deductionFilterClass, setDeductionFilterClass] = useState("");
  const [deductionFilterStudent, setDeductionFilterStudent] = useState("");
  const [deductionForm, setDeductionForm] = useState({
    class_id: "",
    student_id: "",
    action: "RETIRER" as "AJOUTER" | "RETIRER",
    points: "10",
    reason: "",
  });
  const [allStudents, setAllStudents] = useState<{ id: string; first_name: string; last_name: string; class_id: string; class_name: string }[]>([]);
  const [deductionSaving, setDeductionSaving] = useState(false);

  const [measures, setMeasures] = useState<MeasureItem[]>([]);
  const [measureFilterClass, setMeasureFilterClass] = useState("");
  const [measureFilterStudent, setMeasureFilterStudent] = useState("");
  const [measureForm, setMeasureForm] = useState({
    class_id: "",
    student_id: "",
    measure_type: "SOUS_SURVEILLANCE",
    reason: "",
    duration_days: "3",
  });
  const [measureSaving, setMeasureSaving] = useState(false);
  const [editingMeasure, setEditingMeasure] = useState<MeasureItem | null>(null);
  const [measureEditForm, setMeasureEditForm] = useState({ reason: "", duration_days: "3" });
  const [measureEditSaving, setMeasureEditSaving] = useState(false);

  async function loadClasses() {
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setClasses(data.classes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadAttendance() {
    if (!attendanceClassId || !attendanceDate) {
      setAttendanceStudents([]);
      return;
    }
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/attendance?class_id=${attendanceClassId}&date=${attendanceDate}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setAttendanceStudents(data.students ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setAttendanceStudents([]);
    }
  }

  async function loadLatenesses() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (latenessFilterClass) params.set("class_id", latenessFilterClass);
      if (latenessFilterDate) params.set("date", latenessFilterDate);
      const res = await fetchWithAuth(`${API_BASE}/discipline/latenesses?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setLatenesses(data.latenesses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadDeductions() {
    setError("");
    try {
      const params = deductionFilterStudent ? `?student_id=${deductionFilterStudent}` : "";
      const res = await fetchWithAuth(`${API_BASE}/discipline/deductions${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setDeductions(data.deductions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadMeasures() {
    setError("");
    try {
      const params = measureFilterStudent ? `?student_id=${measureFilterStudent}` : "";
      const res = await fetchWithAuth(`${API_BASE}/discipline/measures${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setMeasures(data.measures ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadAllStudents() {
    try {
      const res = await fetchWithAuth(`${API_BASE}/students`);
      const data = await res.json();
      if (!res.ok) return;
      const list = (data.students ?? []).map((s: { id: string; first_name: string; last_name: string; class_id?: string; class_name?: string }) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        class_id: s.class_id ?? "",
        class_name: s.class_name ?? "—",
      }));
      setAllStudents(list);
    } catch {
      setAllStudents([]);
    }
  }

  useEffect(() => {
    loadClasses().then(loadAllStudents).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [attendanceClassId, attendanceDate]);

  useEffect(() => {
    if (tab === "retards") loadLatenesses();
    if (tab === "points") loadDeductions();
    if (tab === "mesures") loadMeasures();
  }, [tab, latenessFilterClass, latenessFilterDate, deductionFilterStudent, deductionFilterClass, measureFilterStudent, measureFilterClass]);

  useEffect(() => {
    if (!latenessForm.class_id) {
      setStudentsForLateness([]);
      return;
    }
    fetchWithAuth(`${API_BASE}/students?class_id=${latenessForm.class_id}`)
      .then((r) => r.json())
      .then((d) => setStudentsForLateness(d.students ?? []))
      .catch(() => setStudentsForLateness([]));
  }, [latenessForm.class_id]);

  async function handleSaveAttendance(e: React.FormEvent) {
    e.preventDefault();
    if (!attendanceClassId || !attendanceDate) return;
    setAttendanceSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/attendance/bulk`, {
        method: "POST",
        body: JSON.stringify({
          class_id: attendanceClassId,
          date: attendanceDate,
          records: attendanceStudents.map((s) => ({ student_id: s.id, status: s.status || "PRESENT" })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      loadAttendance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAttendanceSaving(false);
    }
  }

  function setStudentStatus(studentId: string, status: string) {
    setAttendanceStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status } : s)));
  }

  async function handleAddLateness(e: React.FormEvent) {
    e.preventDefault();
    if (!latenessForm.student_id || !latenessForm.class_id || !latenessForm.date || !latenessForm.arrival_time) return;
    setLatenessSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/latenesses`, {
        method: "POST",
        body: JSON.stringify({
          student_id: latenessForm.student_id,
          class_id: latenessForm.class_id,
          date: latenessForm.date,
          arrival_time: latenessForm.arrival_time,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setLatenessForm((f) => ({ ...f, student_id: "" }));
      loadLatenesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLatenessSaving(false);
    }
  }

  async function handleDeleteLateness(id: string) {
    if (!confirm("Supprimer ce retard ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/latenesses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      loadLatenesses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleAddDeduction(e: React.FormEvent) {
    e.preventDefault();
    const points = parseInt(deductionForm.points, 10);
    if (!deductionForm.student_id || isNaN(points) || points < 1 || points > 100) {
      setError("Sélectionnez une classe, un élève et un nombre de points (1–100).");
      return;
    }
    const pointsDeducted = deductionForm.action === "RETIRER" ? points : -points;
    setDeductionSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/deductions`, {
        method: "POST",
        body: JSON.stringify({
          student_id: deductionForm.student_id,
          points_deducted: pointsDeducted,
          reason: deductionForm.reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setDeductionForm((f) => ({ ...f, student_id: "", reason: "" }));
      loadDeductions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeductionSaving(false);
    }
  }

  const filteredStudentsForDeduction = deductionForm.class_id
    ? allStudents.filter((s) => s.class_id === deductionForm.class_id)
    : allStudents;
  const filteredStudentsForMeasure = measureForm.class_id
    ? allStudents.filter((s) => s.class_id === measureForm.class_id)
    : allStudents;
  const filteredStudentsForDeductionFilter = deductionFilterClass
    ? allStudents.filter((s) => s.class_id === deductionFilterClass)
    : allStudents;
  const filteredStudentsForMeasureFilter = measureFilterClass
    ? allStudents.filter((s) => s.class_id === measureFilterClass)
    : allStudents;

  async function handleDeleteDeduction(id: string) {
    if (!confirm("Supprimer cette déduction ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/deductions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      loadDeductions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function openEditMeasure(m: MeasureItem) {
    setEditingMeasure(m);
    let days = "3";
    if (m.measure_type === "RENVOYE_TEMPORAIREMENT" && m.expires_at && m.created_at) {
      const created = new Date(m.created_at).getTime();
      const expires = new Date(m.expires_at).getTime();
      days = String(Math.max(1, Math.round((expires - created) / (24 * 60 * 60 * 1000))));
    }
    setMeasureEditForm({ reason: m.reason ?? "", duration_days: days });
  }

  async function handleDeleteMeasure(id: string) {
    if (!confirm("Supprimer cette mesure ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/discipline/measures/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      setEditingMeasure(null);
      loadMeasures();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handleUpdateMeasure(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMeasure) return;
    if (editingMeasure.measure_type === "RENVOYE_TEMPORAIREMENT") {
      const days = parseInt(measureEditForm.duration_days, 10);
      if (isNaN(days) || days < 1 || days > 365) {
        setError("Durée entre 1 et 365 jours.");
        return;
      }
    }
    setMeasureEditSaving(true);
    setError("");
    try {
      const body: { reason?: string; duration_days?: number } = {
        reason: measureEditForm.reason.trim() || undefined,
      };
      if (editingMeasure.measure_type === "RENVOYE_TEMPORAIREMENT") {
        body.duration_days = parseInt(measureEditForm.duration_days, 10);
      }
      const res = await fetchWithAuth(`${API_BASE}/discipline/measures/${editingMeasure.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setEditingMeasure(null);
      loadMeasures();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setMeasureEditSaving(false);
    }
  }

  async function handleAddMeasure(e: React.FormEvent) {
    e.preventDefault();
    if (!measureForm.student_id) {
      setError("Sélectionnez un élève.");
      return;
    }
    if (measureForm.measure_type === "RENVOYE_TEMPORAIREMENT") {
      const days = parseInt(measureForm.duration_days, 10);
      if (isNaN(days) || days < 1 || days > 365) {
        setError("Pour un renvoi temporaire, indiquez une durée entre 1 et 365 jours.");
        return;
      }
    }
    setMeasureSaving(true);
    setError("");
    try {
      const body: { student_id: string; measure_type: string; reason?: string; duration_days?: number } = {
        student_id: measureForm.student_id,
        measure_type: measureForm.measure_type,
        reason: measureForm.reason.trim() || undefined,
      };
      if (measureForm.measure_type === "RENVOYE_TEMPORAIREMENT") {
        body.duration_days = parseInt(measureForm.duration_days, 10);
      }
      const res = await fetchWithAuth(`${API_BASE}/discipline/measures`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setMeasureForm((f) => ({ ...f, student_id: "", reason: "" }));
      loadMeasures();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setMeasureSaving(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse text-slate-500">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Discipline</h2>

      <div className="flex gap-2 border-b border-[var(--app-border)]">
        {(["appel", "retards", "points", "mesures"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg border-b-2 -mb-px ${
              tab === t
                ? "border-[var(--school-accent-1)] text-[var(--school-accent-1)] bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t === "appel" && "Appel"}
            {t === "retards" && "Retards"}
            {t === "points" && "Points disciplinaires"}
            {t === "mesures" && "Mesures"}
          </button>
        ))}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {/* Appel */}
      {tab === "appel" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
              <select
                value={attendanceClassId}
                onChange={(e) => setAttendanceClassId(e.target.value)}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2"
              >
                <option value="">Sélectionner</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <DateInputJJMMAAAA
                value={attendanceDate}
                onChange={setAttendanceDate}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 w-full"
              />
            </div>
          </div>
          {attendanceClassId && attendanceDate && (
            <form onSubmit={handleSaveAttendance}>
              <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                    <tr>
                      <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                      <th className="px-4 py-3 font-medium text-slate-900 w-48">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceStudents.length === 0 ? (
                      <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">Aucun élève ou classe non sélectionnée</td></tr>
                    ) : (
                      attendanceStudents.map((s) => (
                        <tr key={s.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-900">{s.first_name} {s.last_name}</td>
                          <td className="px-4 py-2">
                            <select
                              value={s.status ?? "PRESENT"}
                              onChange={(e) => setStudentStatus(s.id, e.target.value)}
                              className="border border-[var(--app-border)] rounded px-2 py-1.5 text-sm w-full max-w-[180px]"
                            >
                              {ATTENDANCE_STATUSES.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {attendanceStudents.length > 0 && (
                <button type="submit" disabled={attendanceSaving} className="mt-3 app-btn-primary disabled:opacity-60">
                  {attendanceSaving ? "Enregistrement..." : "Enregistrer l'appel"}
                </button>
              )}
            </form>
          )}
        </div>
      )}

      {/* Retards */}
      {tab === "retards" && (
        <div className="space-y-6">
          <form onSubmit={handleAddLateness} className="p-4 rounded-xl border border-[var(--app-border)] bg-white max-w-lg space-y-3">
            <h3 className="font-semibold text-slate-900">Enregistrer un retard</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                <select
                  value={latenessForm.class_id}
                  onChange={(e) => setLatenessForm((f) => ({ ...f, class_id: e.target.value, student_id: "" }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Élève</label>
                <select
                  value={latenessForm.student_id}
                  onChange={(e) => setLatenessForm((f) => ({ ...f, student_id: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  {studentsForLateness.map((s) => (
                    <option key={s.id} value={s.id}>{s.order_number ? `${s.order_number} — ` : ""}{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <DateInputJJMMAAAA
                  value={latenessForm.date}
                  onChange={(date) => setLatenessForm((f) => ({ ...f, date }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Heure d'arrivée</label>
                <input
                  type="time"
                  value={latenessForm.arrival_time}
                  onChange={(e) => setLatenessForm((f) => ({ ...f, arrival_time: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={latenessSaving} className="app-btn-primary disabled:opacity-60">
              {latenessSaving ? "Ajout..." : "Ajouter le retard"}
            </button>
          </form>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Liste des retards</h3>
            <div className="flex gap-2 mb-3">
              <select
                value={latenessFilterClass}
                onChange={(e) => setLatenessFilterClass(e.target.value)}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Toutes les classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <DateInputJJMMAAAA
                value={latenessFilterDate}
                onChange={setLatenessFilterDate}
                className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-900">Date</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Heure</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Classe</th>
                    <th className="px-4 py-3 font-medium text-slate-900 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {latenesses.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucun retard enregistré</td></tr>
                  ) : (
                    latenesses.map((l) => (
                      <tr key={l.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600">{formatDateJJMMAAAA(l.date)}</td>
                        <td className="px-4 py-3 text-slate-600">{l.arrival_time}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{l.student_name ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{l.class_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => handleDeleteLateness(l.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Points disciplinaires */}
      {tab === "points" && (
        <div className="space-y-6">
          <form onSubmit={handleAddDeduction} className="p-4 rounded-xl border border-[var(--app-border)] bg-white max-w-lg space-y-3">
            <h3 className="font-semibold text-slate-900">Modifier les points disciplinaires</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
              <select
                value={deductionForm.class_id}
                onChange={(e) => setDeductionForm((f) => ({ ...f, class_id: e.target.value, student_id: "" }))}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
              >
                <option value="">Toutes les classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Élève</label>
              <select
                value={deductionForm.student_id}
                onChange={(e) => setDeductionForm((f) => ({ ...f, student_id: e.target.value }))}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                required
              >
                <option value="">Sélectionner</option>
                {filteredStudentsForDeduction.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Action</label>
                <select
                  value={deductionForm.action}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, action: e.target.value as "AJOUTER" | "RETIRER" }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                >
                  <option value="RETIRER">Retirer des points</option>
                  <option value="AJOUTER">Ajouter des points</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Points (1–100)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={deductionForm.points}
                  onChange={(e) => setDeductionForm((f) => ({ ...f, points: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motif (optionnel)</label>
              <input
                type="text"
                value={deductionForm.reason}
                onChange={(e) => setDeductionForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Ex: retard répété, comportement exemplaire"
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
              />
            </div>
            <button type="submit" disabled={deductionSaving} className="app-btn-primary disabled:opacity-60">
              {deductionSaving ? "Enregistrement..." : deductionForm.action === "RETIRER" ? "Retirer les points" : "Ajouter les points"}
            </button>
          </form>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Historique des déductions</h3>
            <div className="flex flex-wrap gap-4 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                <select
                  value={deductionFilterClass}
                  onChange={(e) => { setDeductionFilterClass(e.target.value); setDeductionFilterStudent(""); }}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Toutes les classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Élève</label>
                <select
                  value={deductionFilterStudent}
                  onChange={(e) => setDeductionFilterStudent(e.target.value)}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm max-w-xs"
                >
                  <option value="">Tous les élèves</option>
                  {filteredStudentsForDeductionFilter.map((s) => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Variation</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Motif</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Date</th>
                    <th className="px-4 py-3 font-medium text-slate-900 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune déduction</td></tr>
                  ) : (
                    deductions.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-900">{d.student_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={d.points_deducted < 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                            {d.points_deducted < 0 ? "+" : "-"}{Math.abs(d.points_deducted)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{d.reason ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateJJMMAAAA(d.created_at)}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => handleDeleteDeduction(d.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mesures disciplinaires */}
      {tab === "mesures" && (
        <div className="space-y-6">
          <form onSubmit={handleAddMeasure} className="p-4 rounded-xl border border-[var(--app-border)] bg-white max-w-lg space-y-3">
            <h3 className="font-semibold text-slate-900">Ajouter une mesure disciplinaire</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
              <select
                value={measureForm.class_id}
                onChange={(e) => setMeasureForm((f) => ({ ...f, class_id: e.target.value, student_id: "" }))}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
              >
                <option value="">Toutes les classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Élève</label>
              <select
                value={measureForm.student_id}
                onChange={(e) => setMeasureForm((f) => ({ ...f, student_id: e.target.value }))}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                required
              >
                <option value="">Sélectionner</option>
                {filteredStudentsForMeasure.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type de mesure</label>
              <select
                value={measureForm.measure_type}
                onChange={(e) => setMeasureForm((f) => ({ ...f, measure_type: e.target.value }))}
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
              >
                {MEASURE_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {measureForm.measure_type === "RENVOYE_TEMPORAIREMENT" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Durée du renvoi (jours)</label>
                <select
                  value={measureForm.duration_days}
                  onChange={(e) => setMeasureForm((f) => ({ ...f, duration_days: e.target.value }))}
                  className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                >
                  {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((d) => (
                    <option key={d} value={String(d)}>{d} jour{d > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motif (optionnel)</label>
              <input
                type="text"
                value={measureForm.reason}
                onChange={(e) => setMeasureForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Ex: comportement en classe"
                className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
              />
            </div>
            <button type="submit" disabled={measureSaving} className="app-btn-primary disabled:opacity-60">
              {measureSaving ? "Ajout..." : "Ajouter la mesure"}
            </button>
          </form>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Historique des mesures</h3>
            <div className="flex flex-wrap gap-4 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                <select
                  value={measureFilterClass}
                  onChange={(e) => { setMeasureFilterClass(e.target.value); setMeasureFilterStudent(""); }}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Toutes les classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Élève</label>
                <select
                  value={measureFilterStudent}
                  onChange={(e) => setMeasureFilterStudent(e.target.value)}
                  className="border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm max-w-xs"
                >
                  <option value="">Tous les élèves</option>
                  {filteredStudentsForMeasureFilter.map((s) => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-900">Élève</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Mesure</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Motif</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Date</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Fin / Échéance</th>
                    <th className="px-4 py-3 font-medium text-slate-900 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {measures.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucune mesure</td></tr>
                  ) : (
                    measures.map((m) => (
                      <tr key={m.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-900">{m.student_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: m.color || "#64748b" }}>{m.label}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{m.reason ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateJJMMAAAA(m.created_at)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {m.measure_type === "RENVOYE_TEMPORAIREMENT" && m.expires_at
                            ? `Jusqu'au ${formatDateJJMMAAAA(m.expires_at)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button type="button" onClick={() => openEditMeasure(m)} className="text-[var(--school-accent-1)] hover:underline text-xs">Modifier</button>
                          <button type="button" onClick={() => handleDeleteMeasure(m.id)} className="text-red-600 hover:underline text-xs">Supprimer</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal modifier une mesure */}
          {editingMeasure && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingMeasure(null)}>
              <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-semibold text-slate-900 mb-3">Modifier la mesure</h3>
                <p className="text-sm text-slate-600 mb-3">
                  {editingMeasure.student_name} — <span className="font-medium" style={{ color: editingMeasure.color }}>{editingMeasure.label}</span>
                </p>
                <form onSubmit={handleUpdateMeasure} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Motif (optionnel)</label>
                    <input
                      type="text"
                      value={measureEditForm.reason}
                      onChange={(e) => setMeasureEditForm((f) => ({ ...f, reason: e.target.value }))}
                      placeholder="Ex: comportement en classe"
                      className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                    />
                  </div>
                  {editingMeasure.measure_type === "RENVOYE_TEMPORAIREMENT" && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Durée du renvoi (jours)</label>
                      <select
                        value={measureEditForm.duration_days}
                        onChange={(e) => setMeasureEditForm((f) => ({ ...f, duration_days: e.target.value }))}
                        className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
                      >
                        {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((d) => (
                          <option key={d} value={String(d)}>{d} jour{d > 1 ? "s" : ""}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end pt-2">
                    <button type="button" onClick={() => setEditingMeasure(null)} className="px-3 py-1.5 rounded-lg border border-[var(--app-border)] text-slate-700 text-sm">Annuler</button>
                    <button type="submit" disabled={measureEditSaving} className="app-btn-primary disabled:opacity-60 text-sm">
                      {measureEditSaving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
