import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API_BASE, fetchWithAuth } from "@/services/api";
import { useSchoolProfile } from "@/context/SchoolProfileContext";
import { ExportBadgePdfButton } from "@/components/ExportBadgePdfButton";
import { buildBadgesPdfBlob, fetchStudentsForClassBadges } from "@/lib/badgeProduction";
import { EDUCATION_LEVELS, educationLevelLabel } from "@/lib/educationLevels";

type ClassItem = {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  room_count?: number;
  rooms?: Array<{ id: string; name: string; capacity: number | null }>;
  student_count?: number;
};

type Subject = { id: string; name: string };

export function DashboardClassesPage() {
  const { school } = useSchoolProfile();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/subjects`),
      ]);
      const classesData = await classesRes.json();
      const subjectsData = await subjectsRes.json();
      if (!classesRes.ok) throw new Error(classesData.message || "Erreur");
      if (!subjectsRes.ok) throw new Error(subjectsData.message || "Erreur");
      setClasses(classesData.classes ?? []);
      setSubjects(subjectsData.subjects ?? []);
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
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        level: level || undefined,
        subject_ids: subjectIds,
      };
      if (editing) {
        const res = await fetchWithAuth(`${API_BASE}/classes/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      } else {
        const res = await fetchWithAuth(`${API_BASE}/classes`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
      }
      setShowForm(false);
      setEditing(null);
      setName("");
      setDescription("");
      setLevel("");
      setSubjectIds([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette classe ?")) return;
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function openEdit(c: ClassItem) {
    setEditing(c);
    setName(c.name);
    setDescription(c.description ?? "");
    setLevel(c.level ?? "");
    setSubjectIds([]);
    setShowForm(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/classes/${c.id}`);
      const data = await res.json();
      if (res.ok) setSubjectIds(data.class?.subject_ids ?? []);
    } catch {
      /* ignore */
    }
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setLevel("");
    setSubjectIds([]);
    setShowForm(true);
  }

  function toggleSubject(id: string) {
    setSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAllSubjects() {
    if (subjectIds.length === subjects.length) {
      setSubjectIds([]);
    } else {
      setSubjectIds(subjects.map((s) => s.id));
    }
  }

  if (loading) return <div className="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Gestion des classes</h2>
        <button onClick={openCreate} className="app-btn-primary">Ajouter une classe</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4 max-w-lg">
          <h3 className="font-semibold text-slate-900">{editing ? "Modifier" : "Nouvelle classe"}</h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Niveau</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              required
              className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40 bg-white"
            >
              <option value="">Choisir le niveau…</option>
              {EDUCATION_LEVELS.map((l) => (
                <option key={l.key} value={l.key}>{l.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Le directeur pédagogique et le secrétaire de ce cycle ne voient que ces classes.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Matières</label>
              {subjects.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subjects.length > 0 && subjectIds.length === subjects.length}
                    onChange={toggleAllSubjects}
                  />
                  Tout cocher
                </label>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--app-border)] p-3 space-y-2">
              {subjects.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aucune matière.{" "}
                  <Link to="/dashboard/subjects" className="text-[var(--school-accent-1)] hover:underline">
                    Créer des matières
                  </Link>
                </p>
              ) : (
                subjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subjectIds.includes(s.id)}
                      onChange={() => toggleSubject(s.id)}
                    />
                    {s.name}
                  </label>
                ))
              )}
            </div>
          </div>
          {editing && (editing.room_count ?? 0) > 0 && (
            <p className="text-sm text-slate-500">
              Salles : {(editing.rooms ?? []).map((r) => r.name).join(", ") || editing.room_count}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">{saving ? "Enregistrement..." : "Enregistrer"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="app-btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      {error && !showForm && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-[var(--app-border)]">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
              <th className="px-4 py-3 font-medium text-slate-900">Niveau</th>
              <th className="px-4 py-3 font-medium text-slate-900">Salles</th>
              <th className="px-4 py-3 font-medium text-slate-900">Élèves</th>
              <th className="px-4 py-3 font-medium text-slate-900 w-64">Actions</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune classe</td></tr>
            ) : (
              classes.map((c) => (
                <tr key={c.id} className="border-b border-[var(--app-border)] hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{educationLevelLabel(c.level)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.room_count
                      ? `${c.room_count} — ${(c.rooms ?? []).map((r) => r.name).join(", ")}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.student_count ?? "-"}</td>
                  <td className="px-4 py-3 flex flex-wrap items-center gap-2">
                    <ExportBadgePdfButton
                      label="Badges"
                      filename={`badges-${c.name}`}
                      disabled={!c.student_count}
                      className="text-sm text-[var(--school-accent-1)] hover:underline border-0 bg-transparent px-0 py-0"
                      getBlob={async () => {
                        const students = await fetchStudentsForClassBadges(c.id);
                        return buildBadgesPdfBlob({ school, students });
                      }}
                    />
                    <button onClick={() => openEdit(c)} className="text-sm text-[var(--school-accent-1)] hover:underline">Modifier</button>
                    <button onClick={() => handleDelete(c.id)} className="text-sm text-red-600 hover:underline">Supprimer</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
