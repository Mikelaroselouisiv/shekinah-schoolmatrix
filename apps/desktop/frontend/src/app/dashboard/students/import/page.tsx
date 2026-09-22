"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { API_BASE, fetchWithAuth } from "@/src/lib/api";

const CSV_HEADER =
  "Identifiant;Prénom;Nom;Classe;Date de naissance;Genre;Téléphone;Email;Nom mère;Tél. mère;Nom père;Tél. père";
const CSV_EXAMPLE = "MIN-2024-001;Jean;Dupont;6ème A;2012-05-15;M;;;Marie Dupont;+243...;Paul Dupont;+243...";

type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export default function StudentsImportPage() {
  const [academicYears, setAcademicYears] = useState<{ id: string; name: string }[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);


  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`${API_BASE}/academic-years`);
        const data = await res.json();
        const years = (data.academic_years ?? []).map((y: { id: string; name: string }) => ({ id: y.id, name: y.name }));
        setAcademicYears(years);
        if (years.length > 0 && !academicYearId) setAcademicYearId(years[0].id);
      } catch {
        setError("Erreur de chargement des années.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function downloadTemplate() {
    const content = [CSV_HEADER, CSV_EXAMPLE].join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele_inscription_eleves.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!file) {
      setError("Choisissez un fichier CSV.");
      return;
    }
    if (!academicYearId) {
      setError("Sélectionnez une année académique.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("academic_year_id", academicYearId);
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE}/students/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur lors de l'import.");
      setResult({
        created: data.created ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
      });
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-slate-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/students" className="text-slate-600 hover:text-slate-900 text-sm">
          ← Retour à l&apos;inscription
        </Link>
      </div>
      <h2 className="text-2xl font-bold text-slate-900">Inscription d&apos;anciens élèves</h2>
      <p className="text-slate-600">
        Importez une liste d&apos;élèves depuis un fichier CSV. Les classes doivent déjà exister dans le système. Les
        élèves déjà présents (même NISU, s’il est renseigné) sont ignorés.
      </p>

      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-2">
        <p className="font-medium text-slate-900">Format du fichier</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Encodage : <strong>UTF-8</strong></li>
          <li>Séparateur : <strong>point-virgule (;)</strong></li>
          <li>Première ligne : <strong>en-têtes de colonnes</strong></li>
          <li>Colonnes obligatoires : <strong>Prénom</strong>, <strong>Nom</strong>, <strong>Classe</strong> (nom exact de la classe)</li>
          <li>Colonnes optionnelles : Identifiant / NISU, Date de naissance (AAAA-MM-JJ), Genre (M/F), Téléphone, Email, Nom mère, Tél. mère, Nom père, Tél. père</li>
        </ul>
        <button
          type="button"
          onClick={downloadTemplate}
          className="mt-2 text-[var(--school-accent-1)] font-medium hover:underline"
        >
          Télécharger le modèle CSV
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 rounded-xl border border-[var(--app-border)] bg-white space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Année académique *</label>
          <select
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2"
            required
          >
            <option value="">Sélectionner</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fichier CSV *</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border border-[var(--app-border)] rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={uploading || !file} className="app-btn-primary disabled:opacity-60">
            {uploading ? "Import en cours..." : "Importer"}
          </button>
          <Link href="/dashboard/students" className="app-btn-secondary">
            Annuler
          </Link>
        </div>
      </form>

      {result && (
        <div className="p-6 rounded-xl border border-[var(--app-border)] bg-white space-y-4">
          <h3 className="font-semibold text-slate-900">Résultat de l&apos;import</h3>
          <div className="flex flex-wrap gap-4">
            <span className="text-green-600 font-medium">{result.created} créé(s)</span>
            <span className="text-slate-600">{result.skipped} ignoré(s) (déjà inscrits)</span>
            {result.errors.length > 0 && (
              <span className="text-amber-600 font-medium">{result.errors.length} erreur(s)</span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-slate-700 mb-2">Détail des erreurs :</p>
              <ul className="space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-slate-600">
                    Ligne {err.row} : {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
