import { useState } from "react";
import type { PdfTableConfig, PdfSection, PdfBuildOptions } from "@/lib/pdfExport";
import { getTablePdfBlob, getSectionsPdfBlob } from "@/lib/pdfExport";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { useSchoolProfileOptional, getImageUrl } from "@/context/SchoolProfileContext";

type ExportPdfButtonProps = {
  table?: PdfTableConfig;
  sections?: PdfSection[];
  getBlob?: () => Promise<Blob>;
  mainTitle?: string;
  filename: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  orientation?: PdfBuildOptions["orientation"];
};

export function ExportPdfButton({
  table,
  sections,
  getBlob,
  mainTitle,
  filename,
  label = "Exporter en PDF",
  className = "",
  disabled = false,
  orientation,
}: ExportPdfButtonProps) {
  const ctx = useSchoolProfileOptional();
  const school = ctx?.school ?? null;
  const [loading, setLoading] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const canExport = Boolean(getBlob || table || (sections && sections.length > 0));

  async function handleClick() {
    if (loading || disabled || !canExport) return;
    setLoading(true);
    setPdfBlob(null);
    try {
      const options: PdfBuildOptions = {
        orientation,
        school: school
          ? {
              name: school.name,
              email: school.email,
              phone: school.phone,
              address: school.address,
              logo_url: getImageUrl(school.logo_url) ?? school.logo_url,
            }
          : undefined,
      };
      let blob: Blob;
      if (getBlob) {
        blob = await getBlob();
      } else if (table) {
        blob = await getTablePdfBlob(table, options);
      } else if (sections?.length) {
        blob = await getSectionsPdfBlob(sections, mainTitle, options);
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleClick();
        }}
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
