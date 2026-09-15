/**
 * Export PDF global : génère un document PDF à partir de tableaux ou de contenu structuré.
 * Utilisable depuis n'importe quelle page (listes de classe, situations de paiement, notes, etc.).
 *
 * Utilisation :
 * - Un seul tableau : exportTableToPdf({ title, subtitle, columns, rows }, "fichier.pdf")
 * - Rapport multi-sections : exportSectionsToPdf(sections, "fichier.pdf", "Titre principal")
 * - Dans l'UI : <ExportPdfButton table={...} filename="x.pdf" /> ou sections={...} + mainTitle
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfColumn = { header: string; key: string };

export type PdfTableConfig = {
  title?: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: Record<string, string | number | null | undefined>[];
};

export type PdfSection = {
  title?: string;
  lines?: string[];
  table?: { columns: PdfColumn[]; rows: Record<string, string | number | null | undefined>[] };
};

function asPdfText(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

/** Construit le doc pour un tableau (partagé entre export et blob). */
function buildTablePdfDoc(config: PdfTableConfig): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 15;
  if (config.title) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(asPdfText(config.title), 14, y);
    y += 10;
  }
  if (config.subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(asPdfText(config.subtitle), 14, y);
    y += 8;
  }
  const headers = config.columns.map((c) => c.header);
  const body = config.rows.map((row) =>
    config.columns.map((col) => {
      const v = row[col.key];
      return v === null || v === undefined ? "-" : asPdfText(v);
    })
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (autoTable as (doc: any, options: any) => void)(doc, {
    startY: y,
    head: [headers],
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    margin: { left: 14, right: 14 },
    tableWidth: "auto",
  });
  return doc;
}

/**
 * Exporte un tableau vers un fichier PDF (téléchargement).
 * @param config titre, sous-titre, colonnes, lignes
 * @param filename nom du fichier sans .pdf
 */
export async function exportTableToPdf(
  config: PdfTableConfig,
  filename: string
): Promise<void> {
  const doc = buildTablePdfDoc(config);
  doc.save(`${filename.replace(/\.pdf$/i, "")}.pdf`);
}

/** Retourne le PDF (tableau) sous forme de Blob pour affichage dans un modal. */
export async function getTablePdfBlob(config: PdfTableConfig): Promise<Blob> {
  const doc = buildTablePdfDoc(config);
  return doc.output("blob");
}

/** Construit le doc pour les sections (partagé entre export et blob). */
function buildSectionsPdfDoc(sections: PdfSection[], mainTitle?: string): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageHeight = 297; // A4 portrait height in mm
  let y = 15;
  if (mainTitle) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(asPdfText(mainTitle), 14, y);
    y += 10;
  }
  for (const section of sections) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 15;
    }
    if (section.title) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(asPdfText(section.title), 14, y);
      y += 8;
    }
    if (section.lines?.length) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      for (const line of section.lines) {
        if (y > pageHeight - 25) {
          doc.addPage();
          y = 15;
        }
        doc.text(asPdfText(line), 14, y);
        y += 6;
      }
      y += 4;
    }
    if (section.table?.columns.length && section.table.rows.length) {
      const headers = section.table.columns.map((c) => c.header);
      const body = section.table.rows.map((row) =>
        section.table!.columns.map((col) => {
          const v = row[col.key];
          return v === null || v === undefined ? "-" : asPdfText(v);
        })
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (autoTable as (doc: any, options: any) => void)(doc, {
        startY: y,
        head: [headers],
        body,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
        margin: { left: 14, right: 14 },
        tableWidth: "auto",
      });
      y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
      y += 10;
    }
  }
  return doc;
}

/**
 * Exporte plusieurs sections (titres, lignes de texte, tableaux) dans un même PDF.
 * Utile pour des rapports (ex. fiche élève : identité + paiement + notes).
 */
export async function exportSectionsToPdf(
  sections: PdfSection[],
  filename: string,
  mainTitle?: string
): Promise<void> {
  const doc = buildSectionsPdfDoc(sections, mainTitle);
  doc.save(`${filename.replace(/\.pdf$/i, "")}.pdf`);
}

/** Retourne le PDF (sections) sous forme de Blob pour affichage dans un modal. */
export async function getSectionsPdfBlob(
  sections: PdfSection[],
  mainTitle?: string
): Promise<Blob> {
  const doc = buildSectionsPdfDoc(sections, mainTitle);
  return doc.output("blob");
}
