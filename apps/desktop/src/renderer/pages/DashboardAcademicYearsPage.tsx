import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { formatDateJJMMAAAA } from "@/lib/format";
import { DateInputJJMMAAAA } from "@/components/DateInputJJMMAAAA";
import { useRevealScroll } from "@/lib/useRevealScroll";
import {
  PERIOD_SCOPES,
  isPeriodScope,
  periodScopeLabel,
  type PeriodScope,
} from "@/lib/educationLevels";

type AcademicYear = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
};

type Period = {
  id: string;
  name: string;
  order_index: number;
  scope?: string;
  academic_year_id: string;
  academic_year_name?: string;
};

export function DashboardAcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showYearForm, setShowYearForm] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [yearName, setYearName] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [yearActive, setYearActive] = useState(true);
  const [savingYear, setSavingYear] = useState(false);

  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [periodName, setPeriodName] = useState("");
  const [periodOrder, setPeriodOrder] = useState(0);
  const [periodScope, setPeriodScope] = useState<PeriodScope>("ECOLE");
  const [savingPeriod, setSavingPeriod] = useState(false);
  const yearFormRef = useRevealScroll<HTMLFormElement>(showYearForm, editingYear?.id ?? "new");
  const periodFormRef = useRevealScroll<HTMLFormElement>(showPeriodForm, editingPeriod?.id ?? "new");

  const [currentYearId, setCurrentYearId] = useState<string | null>(null);
  const [currentPeriodId, setCurrentPeriodId] = useState<string | null>(null);
  const [currentPreschoolPeriodId, setCurrentPreschoolPeriodId] = useState<string | null>(null);
  const [savingCurrent, setSavingCurrent] = useState(false);


  async function loadCurrentContext(): Promise<{
    current_academic_year_id: string | null;
    current_period_id: string | null;
    current_preschool_period_id: string | null;
  } | null> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/school/current-context`);
      const data = await res.json();
      if (res.ok) {
        const yearId = data.current_academic_year_id ?? null;
        const periodId = data.current_period_id ?? null;
        const preschoolPeriodId = data.current_preschool_period_id ?? null;
        setCurrentYearId(yearId);
        setCurrentPeriodId(periodId);
        setCurrentPreschoolPeriodId(preschoolPeriodId);
        return {
          current_academic_year_id: yearId,
          current_period_id: periodId,
          current_preschool_period_id: preschoolPeriodId,
        };
      }
    } catch {
      setCurrentYearId(null);
      setCurrentPeriodId(null);
      setCurrentPreschoolPeriodId(null);
    }
    return null;
  }

  async function setAsCurrentYear(yearId: string) {
    setSavingCurrent(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/school/profile`, {
        method: "PATCH",
        body: JSON.stringify({ current_academic_year_id: yearId }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Erreur");
      setCurrentYearId(yearId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingCurrent(false);
    }
  }

  async function setAsCurrentPeriod(p: Period) {
    setSavingCurrent(true);
    setError("");
    const preschool = p.scope === "PRESCOLAIRE";
    try {
      const res = await fetchWithAuth(`${API_BASE}/school/profile`, {
        method: "PATCH",
        body: JSON.stringify(
          preschool
            ? { current_preschool_period_id: p.id }
            : { current_period_id: p.id },
        ),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Erreur");
      if (preschool) setCurrentPreschoolPeriodId(p.id);
      else setCurrentPeriodId(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingCurrent(false);
    }
  }

  async function loadYears() {
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/academic-years`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setYears(data.academic_years ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function loadPeriods() {
    if (!selectedYearId) {
      setPeriods([]);
      return;
    }
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/periods?academic_year_id=${selectedYearId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setPeriods(data.periods ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [yearsRes, ctxRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/school/current-context`),
      ]);
      const yearsData = await yearsRes.json();
      const ctxData = await ctxRes.json();
      if (!yearsRes.ok) throw new Error(yearsData.message || "Erreur");
      const years = yearsData.academic_years ?? [];
      setYears(years);
      const yearId = ctxRes.ok ? (ctxData.current_academic_year_id ?? null) : null;
      const periodId = ctxRes.ok ? (ctxData.current_period_id ?? null) : null;
      const preschoolPeriodId = ctxRes.ok ? (ctxData.current_preschool_period_id ?? null) : null;
      setCurrentYearId(yearId);
      setCurrentPeriodId(periodId);
      setCurrentPreschoolPeriodId(preschoolPeriodId);
      if (years.length > 0) {
        const defaultYearId = yearId && years.some((y: AcademicYear) => y.id === yearId)
          ? yearId
          : years[0].id;
        setSelectedYearId(defaultYearId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [selectedYearId]);

  async function handleYearSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingYear(true);
    setError("");
    try {
      const body = {
        name: yearName.trim(),
        start_date: yearStart || undefined,
        end_date: yearEnd || undefined,
        active: yearActive,
      };
      if (editingYear) {
        const res = await fetchWithAuth(`${API_BASE}/academic-years/${editingYear.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/academic-years`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowYearForm(false);
      setEditingYear(null);
      setYearName("");
      setYearStart("");
      setYearEnd("");
      setYearActive(true);
      await loadYears();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingYear(false);
    }
  }

  async function handleYearDelete(id: string) {
    if (!confirm("Supprimer cette annee scolaire et ses periodes ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/academic-years/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      if (selectedYearId === id) setSelectedYearId("");
      await loadYears();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function handlePeriodSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedYearId) return;
    setSavingPeriod(true);
    setError("");
    try {
      const body = editingPeriod
        ? { name: periodName.trim(), order_index: periodOrder, scope: periodScope }
        : {
            academic_year_id: selectedYearId,
            name: periodName.trim(),
            order_index: periodOrder,
            scope: periodScope,
          };
      if (editingPeriod) {
        const res = await fetchWithAuth(`${API_BASE}/periods/${editingPeriod.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/periods`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowPeriodForm(false);
      setEditingPeriod(null);
      setPeriodName("");
      setPeriodOrder(periods.length);
      setPeriodScope("ECOLE");
      await loadPeriods();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingPeriod(false);
    }
  }

  async function handlePeriodDelete(id: string) {
    if (!confirm("Supprimer cette periode ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/periods/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      await loadPeriods();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function openYearEdit(y: AcademicYear) {
    setEditingYear(y);
    setYearName(y.name);
    setYearStart(y.start_date ?? "");
    setYearEnd(y.end_date ?? "");
    setYearActive(y.active);
    setShowYearForm(true);
  }

  function openYearCreate() {
    setEditingYear(null);
    setYearName("");
    setYearStart("");
    setYearEnd("");
    setYearActive(true);
    setShowYearForm(true);
  }

  function openPeriodEdit(p: Period) {
    setEditingPeriod(p);
    setPeriodName(p.name);
    setPeriodOrder(p.order_index);
    setPeriodScope(isPeriodScope(p.scope) ? p.scope : "ECOLE");
    setShowPeriodForm(true);
  }

  function openPeriodCreate() {
    setEditingPeriod(null);
    setPeriodName("");
    setPeriodOrder(periods.length);
    setPeriodScope("ECOLE");
    setShowPeriodForm(true);
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  const selectedYear = years.find((y) => y.id === selectedYearId);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-slate-900">Années et périodes</h2>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {/* Années scolaires */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-900">Années scolaires</h3>
          <button onClick={openYearCreate} className="app-btn-primary text-sm py-2">
            Ajouter une année
          </button>
        </div>

        {showYearForm && (
          <form ref={yearFormRef} onSubmit={handleYearSubmit} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-lg">
            <h4 className="font-semibold text-slate-900">{editingYear ? "Modifier" : "Nouvelle année"}</h4>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
              <input
                type="text"
                value={yearName}
                onChange={(e) => setYearName(e.target.value)}
                placeholder="2024-2025"
                className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Début</label>
                <DateInputJJMMAAAA
                  value={yearStart}
                  onChange={setYearStart}
                  className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fin</label>
                <DateInputJJMMAAAA
                  value={yearEnd}
                  onChange={setYearEnd}
                  className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="yearActive"
                type="checkbox"
                checked={yearActive}
                onChange={(e) => setYearActive(e.target.checked)}
                className="rounded border-slate-300 text-[var(--school-accent-1)]"
              />
              <label htmlFor="yearActive" className="text-sm text-slate-700">Année active</label>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={savingYear} className="app-btn-primary disabled:opacity-60 text-sm py-2">
                {savingYear ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button type="button" onClick={() => { setShowYearForm(false); setEditingYear(null); }} className="app-btn-secondary text-sm py-2">Annuler</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-[var(--app-border)]">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
                <th className="px-4 py-3 font-medium text-slate-900">Début</th>
                <th className="px-4 py-3 font-medium text-slate-900">Fin</th>
                <th className="px-4 py-3 font-medium text-slate-900">Statut</th>
                <th className="px-4 py-3 font-medium text-slate-900">Année en cours</th>
                <th className="px-4 py-3 font-medium text-slate-900 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {years.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucune année</td></tr>
              ) : (
                years.map((y) => (
                  <tr
                    key={y.id}
                    className={`border-b border-[var(--app-border)] hover:bg-slate-50/50 cursor-pointer ${selectedYearId === y.id ? "bg-slate-50" : ""}`}
                    onClick={() => setSelectedYearId(y.id)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{y.name}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateJJMMAAAA(y.start_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateJJMMAAAA(y.end_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${y.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                        {y.active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      {currentYearId === y.id ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Par défaut</span>
                      ) : (
                        <button type="button" onClick={() => setAsCurrentYear(y.id)} disabled={savingCurrent} className="text-sm text-[var(--school-accent-1)] hover:underline disabled:opacity-50">
                          Définir par défaut
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 flex gap-2" onClick={(ev) => ev.stopPropagation()}>
                      <button onClick={() => openYearEdit(y)} className="text-sm text-[var(--school-accent-1)] hover:underline">Modifier</button>
                      <button onClick={() => handleYearDelete(y.id)} className="text-sm text-red-600 hover:underline">Supprimer</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Périodes */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Périodes {selectedYear ? `(${selectedYear.name})` : ""}
          </h3>
          {selectedYearId && (
            <button onClick={openPeriodCreate} className="app-btn-primary text-sm py-2">
              Ajouter une période
            </button>
          )}
        </div>

        {!selectedYearId ? (
          <p className="text-slate-500 text-sm">Sélectionnez une année scolaire ci-dessus pour gérer ses périodes.</p>
        ) : (
          <>
            {showPeriodForm && (
              <form ref={periodFormRef} onSubmit={handlePeriodSubmit} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-md">
                <h4 className="font-semibold text-slate-900">{editingPeriod ? "Modifier" : "Nouvelle période"}</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={periodName}
                    onChange={(e) => setPeriodName(e.target.value)}
                    placeholder="Trimestre 1"
                    className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={periodScope}
                    onChange={(e) =>
                      setPeriodScope(isPeriodScope(e.target.value) ? e.target.value : "ECOLE")
                    }
                    className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                  >
                    {PERIOD_SCOPES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ordre</label>
                  <input
                    type="number"
                    min={0}
                    value={periodOrder}
                    onChange={(e) => setPeriodOrder(parseInt(e.target.value, 10) || 0)}
                    className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                  />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={savingPeriod} className="app-btn-primary disabled:opacity-60 text-sm py-2">
                    {savingPeriod ? "Enregistrement..." : "Enregistrer"}
                  </button>
                  <button type="button" onClick={() => { setShowPeriodForm(false); setEditingPeriod(null); }} className="app-btn-secondary text-sm py-2">Annuler</button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-900">Ordre</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Type</th>
                    <th className="px-4 py-3 font-medium text-slate-900">Période en cours</th>
                    <th className="px-4 py-3 font-medium text-slate-900 w-36">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune période</td></tr>
                  ) : (
                    [...periods]
                      .sort((a, b) => {
                        const sa = a.scope === "PRESCOLAIRE" ? 0 : 1;
                        const sb = b.scope === "PRESCOLAIRE" ? 0 : 1;
                        return sa - sb || a.order_index - b.order_index;
                      })
                      .map((p) => {
                        const current =
                          p.scope === "PRESCOLAIRE"
                            ? currentPreschoolPeriodId === p.id
                            : currentPeriodId === p.id;
                        return (
                        <tr key={p.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-600">{p.order_index}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                          <td className="px-4 py-3 text-slate-600">{periodScopeLabel(p.scope)}</td>
                          <td className="px-4 py-3">
                            {current ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Par défaut</span>
                            ) : (
                              <button type="button" onClick={() => setAsCurrentPeriod(p)} disabled={savingCurrent} className="text-sm text-[var(--school-accent-1)] hover:underline disabled:opacity-50">
                                Définir par défaut
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 flex gap-2">
                            <button onClick={() => openPeriodEdit(p)} className="text-sm text-[var(--school-accent-1)] hover:underline">Modifier</button>
                            <button onClick={() => handlePeriodDelete(p.id)} className="text-sm text-red-600 hover:underline">Supprimer</button>
                          </td>
                        </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
