"use client";

import { useState } from "react";
import type { PdfTableConfig, PdfSection } from "@/src/lib/pdfExport";
import { getTablePdfBlob, getSectionsPdfBlob } from "@/src/lib/pdfExport";
import { PdfPreviewModal } from "@/src/components/PdfPreviewModal";

type ExportPdfButtonProps = {
  /** Export simple : un seul tableau */
  table?: PdfTableConfig;
  /** Export multi-sections (fiche, rapport) */
  sections?: PdfSection[];
  /** Générateur personnalisé (listes imprimables, etc.). */
  getBlob?: () => Promise<Blob>;
  mainTitle?: string;
  filename: string;
  label?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Bouton "Exporter en PDF" : ouvre un modal avec aperçu du PDF, téléchargement et impression.
 */
export function ExportPdfButton({
  table,
  sections,
  getBlob,
  mainTitle,
  filename,
  label = "Exporter en PDF",
  className = "",
  disabled = false,
}: ExportPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const canExport = Boolean(getBlob || table || (sections && sections.length > 0));

  async function handleClick() {
    if (loading || disabled || !canExport) return;
    setLoading(true);
    setPdfBlob(null);
    try {
      let blob: Blob;
      if (getBlob) {
        blob = await getBlob();
      } else if (table) {
        blob = await getTablePdfBlob(table);
      } else if (sections?.length) {
        blob = await getSectionsPdfBlob(sections, mainTitle);
      } else {
        return;
      }
      setPdfBlob(blob);
    } catch (e) {
      console.error("Export PDF failed", e);
    } finally {
      setLoading(false);
    }
  }

  const safeFilename = filename.replace(/\.pdf$/i, "") + ".pdf";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading || !canExport}
        className={className || "inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"}
      >
        {loading ? "Génération..." : label}
      </button>
      {pdfBlob && (
        <PdfPreviewModal
          blob={pdfBlob}
          filename={safeFilename}
          onClose={() => setPdfBlob(null)}
        />
      )}
    </>
  );
}
