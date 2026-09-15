import { useState, useEffect } from "react";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { AppAccordion } from "@/components/AppAccordion";

type Subject = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  preschool_eval?: "LEVEL" | "FREQUENCY";
};

type BringItem = { id: string; label: string };

export function DashboardSubjectsPage() {
  const [openBlock, setOpenBlock] = useState<"subjects" | "materials">("subjects");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [materials, setMaterials] = useState<BringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [preschoolEval, setPreschoolEval] = useState<"LEVEL" | "FREQUENCY">("LEVEL");
  const [saving, setSaving] = useState(false);

  const [showMatForm, setShowMatForm] = useState(false);
  const [editingMat, setEditingMat] = useState<BringItem | null>(null);
  const [matLabel, setMatLabel] = useState("");
  const [savingMat, setSavingMat] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [subjRes, matRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/subjects`),
        fetchWithAuth(`${API_BASE}/bring-item-catalog`),
      ]);
      const subjData = await subjRes.json();
      const matData = await matRes.json();
      if (!subjRes.ok) throw new Error(subjData.message || "Erreur");
      setSubjects(subjData.subjects ?? []);
      setMaterials(matRes.ok ? (matData.catalog ?? []) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing) {
        const res = await fetchWithAuth(`${API_BASE}/subjects/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim() || undefined,
            preschool_eval: preschoolEval,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/subjects`, {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim() || undefined,
            preschool_eval: preschoolEval,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowForm(false);
      setEditing(null);
      setName("");
      setCode("");
      setPreschoolEval("LEVEL");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette matière ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/subjects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function openEdit(s: Subject) {
    setOpenBlock("subjects");
    setEditing(s);
    setName(s.name);
    setCode(s.code ?? "");
    setPreschoolEval(s.preschool_eval === "FREQUENCY" ? "FREQUENCY" : "LEVEL");
    setShowForm(true);
  }

  function openCreate() {
    setOpenBlock("subjects");
    setEditing(null);
    setName("");
    setCode("");
    setPreschoolEval("LEVEL");
    setShowForm(true);
  }

  async function handleMatSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingMat(true);
    setError("");
    try {
      if (editingMat) {
        const res = await fetchWithAuth(`${API_BASE}/bring-item-catalog/${editingMat.id}`, {
          method: "PATCH",
          body: JSON.stringify({ label: matLabel.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/bring-item-catalog`, {
          method: "POST",
          body: JSON.stringify({ label: matLabel.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowMatForm(false);
      setEditingMat(null);
      setMatLabel("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingMat(false);
    }
  }

  async function handleMatDelete(id: string) {
    if (!confirm("Supprimer ce matériel ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/bring-item-catalog/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function openMatEdit(item: BringItem) {
    setOpenBlock("materials");
    setEditingMat(item);
    setMatLabel(item.label);
    setShowMatForm(true);
  }

  function openMatCreate() {
    setOpenBlock("materials");
    setEditingMat(null);
    setMatLabel("");
    setShowMatForm(true);
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">Matières</h2>
      {error && !showForm && !showMatForm ? (
        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
      ) : null}

      <AppAccordion
        title="Catalogue des matières"
        summary={`${subjects.length}`}
        open={openBlock === "subjects"}
        onToggle={() => setOpenBlock("subjects")}
        headerRight={
          <button type="button" onClick={openCreate} className="app-btn-primary text-sm py-1.5">
            Ajouter
          </button>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-white">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-[var(--app-border)]">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
                <th className="px-4 py-3 font-medium text-slate-900">Code</th>
                <th className="px-4 py-3 font-medium text-slate-900">Préscolaire</th>
                <th className="px-4 py-3 font-medium text-slate-900">Statut</th>
                <th className="px-4 py-3 font-medium text-slate-900 w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune matière</td></tr>
              ) : (
                subjects.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.code ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.preschool_eval === "FREQUENCY" ? "Fréquence" : "Niveau"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button type="button" onClick={() => openEdit(s)} className="text-sm text-[var(--school-accent-1)] hover:underline">Modifier</button>
                      <button type="button" onClick={() => handleDelete(s.id)} className="text-sm text-red-600 hover:underline">Supprimer</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AppAccordion>

      <AppAccordion
        title="Matériel à apporter"
        summary={`${materials.length}`}
        open={openBlock === "materials"}
        onToggle={() => setOpenBlock("materials")}
        headerRight={
          <button type="button" onClick={openMatCreate} className="app-btn-primary text-sm py-1.5">
            Ajouter
          </button>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-white">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-[var(--app-border)]">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
                <th className="px-4 py-3 font-medium text-slate-900 w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {materials.length === 0 ? (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">Aucun matériel</td></tr>
              ) : (
                materials.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.label}</td>
                    <td className="px-4 py-3 flex gap-2">
                      <button type="button" onClick={() => openMatEdit(item)} className="text-sm text-[var(--school-accent-1)] hover:underline">Modifier</button>
                      <button type="button" onClick={() => handleMatDelete(item.id)} className="text-sm text-red-600 hover:underline">Supprimer</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AppAccordion>

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
          >
            <h3 className="font-semibold text-slate-900">{editing ? "Modifier" : "Nouvelle matière"}</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--app-border)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-[var(--app-border)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Préscolaire</label>
              <select
                value={preschoolEval}
                onChange={(e) => setPreschoolEval(e.target.value === "FREQUENCY" ? "FREQUENCY" : "LEVEL")}
                className="w-full rounded-lg border border-[var(--app-border)] px-4 py-2.5"
              >
                <option value="LEVEL">Niveau (Moins bien, Bien, Très bien, Excellent)</option>
                <option value="FREQUENCY">Fréquence (Jamais, Parfois, Toujours)</option>
              </select>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="app-btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showMatForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setShowMatForm(false);
            setEditingMat(null);
          }}
        >
          <form
            onSubmit={handleMatSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
          >
            <h3 className="font-semibold text-slate-900">{editingMat ? "Modifier" : "Nouveau matériel"}</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
              <input
                type="text"
                value={matLabel}
                onChange={(e) => setMatLabel(e.target.value)}
                className="w-full rounded-lg border border-[var(--app-border)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
                required
                autoFocus
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-3">
              <button type="submit" disabled={savingMat} className="app-btn-primary disabled:opacity-60">
                {savingMat ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMatForm(false);
                  setEditingMat(null);
                }}
                className="app-btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
