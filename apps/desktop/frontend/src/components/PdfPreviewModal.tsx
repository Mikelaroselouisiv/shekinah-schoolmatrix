"use client";

import { useEffect, useRef, useState } from "react";

type PdfPreviewModalProps = {
  blob: Blob;
  filename: string;
  onClose: () => void;
};

export function PdfPreviewModal({ blob, filename, onClose }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const pdfBlob =
      blob.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  function handleDownload() {
    if (!objectUrl) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename.replace(/\.pdf$/i, "") + ".pdf";
    a.click();
  }

  function handlePrint() {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !objectUrl) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(objectUrl, "_blank")?.print();
    }
    window.schoolmatrixDesktop?.restoreKeyboardFocus?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-800">Aperçu PDF</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Télécharger
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Imprimer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Fermer
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl bg-slate-100">
          {objectUrl && (
            <iframe
              ref={iframeRef}
              src={objectUrl}
              title="Aperçu PDF"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
