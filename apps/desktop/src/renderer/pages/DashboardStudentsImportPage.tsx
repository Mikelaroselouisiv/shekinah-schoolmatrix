import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API_BASE, fetchWithAuth } from "@/services/api";

type ClassItem = { id: string; name: string };
type AcademicYear = { id: string; name: string };

type ParsedRow = {
  row: number;
  order_number: string;
  last_name: string;
  first_name: string;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
};

type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export function DashboardStudentsImportPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classId, setClassId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cRes, ayRes, ctxRes] = await Promise.all([
          fetchWithAuth(`${API_BASE}/classes`),
          fetchWithAuth(`${API_BASE}/academic-years`),
          fetchWithAuth(`${API_BASE}/school/current-context`),
        ]);
        const cData = await cRes.json();
        const ayData = await ayRes.json();
        const ctxData = await ctxRes.json().catch(() => ({}));
        setClasses(cData.classes ?? []);
        const years = ayData.academic_years ?? [];
        setAcademicYears(years);
        if (ctxData.current_academic_year_id) {
          setAcademicYearId(ctxData.current_academic_year_id);
        } else if (years[0]?.id) {
          setAcademicYearId(years[0].id);
        }
      } catch {
        setError("Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setRows([]);
    setWarnings([]);
    if (!classId) {
      setError("Choisissez une classe.");
      return;
    }
    if (!file) {
      setError("Choisissez un fichier PDF.");
      return;
    }
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/students/import-pdf/preview`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Réponse serveur invalide."
            : `Erreur serveur (${res.status}). Vérifiez que l’API tourne (backend :3000).`,
        );
      }
      const msg = Array.isArray(data.message) ? data.message.join(" ") : data.message;
      if (!res.ok) throw new Error(msg || "Erreur d'analyse du PDF.");
      setRows(data.rows ?? []);
      setWarnings(data.warnings ?? []);
      if (!(data.rows ?? []).length) {
        setError(
          data.warnings?.[0] ||
            "Aucune ligne élève détectée. Ajoutez GEMINI_API_KEY dans le .env du backend pour l’analyse IA.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmImport() {
    if (!classId || !rows.length) return;
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("class_id", classId);
      if (academicYearId) formData.append("academic_year_id", academicYearId);
      formData.append("rows_json", JSON.stringify(rows));
      if (file) formData.append("file", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/students/import-pdf`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Réponse serveur invalide."
            : `Erreur serveur (${res.status}). Vérifiez que l’API tourne (backend :3000).`,
        );
      }
      const msg = Array.isArray(data.message) ? data.message.join(" ") : data.message;
      if (!res.ok) throw new Error(msg || "Erreur d'import.");
      setResult({
        created: data.created ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
      });
      setRows([]);
      setWarnings([]);
      setFile(null);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setImporting(false);
    }
  }

  function closeResultModal() {
    setResult(null);
    setError("");
  }

  function removeRow(orderNumber: string) {
    setRows((prev) => prev.filter((r) => r.order_number !== orderNumber));
  }

  if (loading) {
    return <p className="text-slate-500">Chargement...</p>;
  }

  const className = classes.find((c) => c.id === classId)?.name ?? "";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Link to="/dashboard/students" className="text-slate-600 hover:text-slate-900 text-sm">
          ← Retour
        </Link>
      </div>
      <h2 className="text-2xl font-bold text-slate-900">Inscription d&apos;anciens élèves</h2>

      <form onSubmit={handlePreview} className="p-5 rounded-xl border border-[var(--app-border)] bg-white space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Classe *</label>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setRows([]);
                setResult(null);
              }}
              className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
              required
            >
              <option value="">Sélectionner</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Année académique</label>
            <select
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fichier PDF *</label>
          <input
            key={fileInputKey}
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRows([]);
              setResult(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="app-btn-secondary text-sm py-2"
            >
              {file ? "Changer le PDF" : "Choisir un PDF"}
            </button>
            <span className="text-sm text-slate-600 truncate max-w-xs">
              {file ? file.name : "Aucun fichier choisi"}
            </span>
          </div>
        </div>
        {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
        <button type="submit" disabled={parsing || !classId || !file} className="app-btn-primary text-sm py-2 disabled:opacity-60">
          {parsing ? "Analyse IA du PDF (lots auto si long)…" : "Analyser le PDF"}
        </button>
        {parsing && (
          <p className="text-xs text-slate-500">
            Les PDF longs sont découpés automatiquement côté serveur — laissez tourner.
          </p>
        )}
      </form>

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">
              Aperçu — {rows.length} élève(s) → {className}
            </h3>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className="app-btn-primary text-sm py-2 disabled:opacity-60"
            >
              {importing ? "Inscription…" : `Inscrire ${rows.length} élève(s)`}
            </button>
          </div>
          {warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs space-y-1">
              {warnings.slice(0, 8).map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-[var(--app-border)]">
                <tr>
                  <th className="px-3 py-2 font-medium">NISU</th>
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Prénom</th>
                  <th className="px-3 py-2 font-medium">Sexe</th>
                  <th className="px-3 py-2 font-medium">Naissance</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.order_number}-${r.row}`} className="border-b border-[var(--app-border)]">
                    <td className="px-3 py-2 font-mono text-xs">{r.order_number}</td>
                    <td className="px-3 py-2">{r.last_name}</td>
                    <td className="px-3 py-2">{r.first_name}</td>
                    <td className="px-3 py-2">{r.gender ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {[r.birth_date, r.birth_place].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeRow(r.order_number)} className="text-red-600 text-xs hover:underline">
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeResultModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-white p-6 shadow-lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Inscription terminée</h3>
            <p className="text-sm text-slate-700">
              <strong>{result.created}</strong> inscrit(s), <strong>{result.skipped}</strong> déjà présent(s)
              {result.errors.length ? `, ${result.errors.length} erreur(s)` : ""}.
            </p>
            {result.errors.length > 0 && (
              <ul className="list-disc list-inside text-sm text-red-700 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 15).map((e, i) => (
                  <li key={i}>Ligne {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={closeResultModal} className="app-btn-primary text-sm py-2">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
