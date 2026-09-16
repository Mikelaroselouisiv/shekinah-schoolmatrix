/**
 * Export PDF : tableaux ou sections, avec en-tête d’établissement.
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

export type PdfSchoolInfo = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logo_url?: string | null;
};

export type PdfBuildOptions = {
  school?: PdfSchoolInfo | null;
  orientation?: "portrait" | "landscape";
};

function asPdfText(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

async function loadLogoPng(url?: string | null): Promise<string | null> {
  if (!url || typeof document === "undefined") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const max = 160;
            const scale = Math.min(max / (img.width || 1), max / (img.height || 1), 1);
            canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
            canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/png"));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

function drawSchoolHeader(
  doc: jsPDF,
  school: PdfSchoolInfo | null | undefined,
  logo: string | null,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 12;
  const logoMm = 16;
  const textX = logo ? margin + logoMm + 4 : margin;

  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, y - 1, logoMm, logoMm);
    } catch {
      /* logo illisible */
    }
  }

  const name = asPdfText((school?.name || "").trim() || "Établissement");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(name, textX, y + 4);

  const details = [
    school?.address?.trim(),
    [school?.phone?.trim(), school?.email?.trim()].filter(Boolean).join("   ·   "),
  ].filter((line): line is string => !!line);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  let detailY = y + 9;
  for (const line of details) {
    doc.text(asPdfText(line), textX, detailY);
    detailY += 4;
  }

  y = Math.max(logo ? y - 1 + logoMm : y, detailY) + 3;
  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y + 1.2, pageW - margin, y + 1.2);
  return y + 8;
}

function tableOptions(startY: number) {
  return {
    startY,
    theme: "grid" as const,
    styles: {
      fontSize: 8.5,
      cellPadding: 2.4,
      valign: "top" as const,
      overflow: "linebreak" as const,
    },
    headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    margin: { left: 14, right: 14 },
    tableWidth: "auto" as const,
  };
}

async function createDoc(options?: PdfBuildOptions): Promise<{
  doc: jsPDF;
  y: number;
  pageHeight: number;
}> {
  const orientation = options?.orientation ?? "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const logo = await loadLogoPng(options?.school?.logo_url);
  const y = options?.school
    ? drawSchoolHeader(doc, options.school, logo)
    : 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  return { doc, y, pageHeight };
}

function drawDocTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(asPdfText(title), 14, y);
  return y + 8;
}

async function buildTablePdfDoc(
  config: PdfTableConfig,
  options?: PdfBuildOptions,
): Promise<jsPDF> {
  const { doc, y: start } = await createDoc(options);
  let y = start;
  if (config.title) y = drawDocTitle(doc, config.title, y);
  if (config.subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(asPdfText(config.subtitle), 14, y);
    y += 7;
  }
  const headers = config.columns.map((c) => c.header);
  const body = config.rows.map((row) =>
    config.columns.map((col) => {
      const v = row[col.key];
      return v === null || v === undefined ? "-" : asPdfText(v);
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (autoTable as (doc: any, options: any) => void)(doc, {
    ...tableOptions(y),
    head: [headers],
    body,
  });
  return doc;
}

async function buildSectionsPdfDoc(
  sections: PdfSection[],
  mainTitle?: string,
  options?: PdfBuildOptions,
): Promise<jsPDF> {
  const { doc, y: start, pageHeight } = await createDoc(options);
  let y = start;
  if (mainTitle) y = drawDocTitle(doc, mainTitle, y);
  for (const section of sections) {
    if (y > pageHeight - 36) {
      doc.addPage();
      y = options?.school ? 16 : 15;
    }
    if (section.title) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(13, 148, 136);
      doc.text(asPdfText(section.title), 14, y);
      y += 7;
    }
    if (section.lines?.length) {
      const pageW = doc.internal.pageSize.getWidth();
      const contentW = pageW - 28;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (autoTable as (doc: any, options: any) => void)(doc, {
        startY: y,
        theme: "plain",
        styles: {
          fontSize: 9.5,
          cellPadding: { top: 1.4, right: 0, bottom: 1.4, left: 0 },
          overflow: "linebreak",
          valign: "top",
          textColor: [30, 41, 59],
          font: "helvetica",
        },
        margin: { left: 14, right: 14 },
        tableWidth: contentW,
        columnStyles: { 0: { cellWidth: contentW } },
        body: section.lines.map((line) => [asPdfText(line)]),
      });
      y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
      y += 5;
    }
    if (section.table?.columns.length && section.table.rows.length) {
      const headers = section.table.columns.map((c) => c.header);
      const body = section.table.rows.map((row) =>
        section.table!.columns.map((col) => {
          const v = row[col.key];
          return v === null || v === undefined ? "-" : asPdfText(v);
        }),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (autoTable as (doc: any, options: any) => void)(doc, {
        ...tableOptions(y),
        head: [headers],
        body,
      });
      y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
      y += 10;
    }
  }
  return doc;
}

export async function exportTableToPdf(
  config: PdfTableConfig,
  filename: string,
  options?: PdfBuildOptions,
): Promise<void> {
  const doc = await buildTablePdfDoc(config, options);
  doc.save(`${filename.replace(/\.pdf$/i, "")}.pdf`);
}

export async function getTablePdfBlob(
  config: PdfTableConfig,
  options?: PdfBuildOptions,
): Promise<Blob> {
  const doc = await buildTablePdfDoc(config, options);
  return doc.output("blob");
}

export async function exportSectionsToPdf(
  sections: PdfSection[],
  filename: string,
  mainTitle?: string,
  options?: PdfBuildOptions,
): Promise<void> {
  const doc = await buildSectionsPdfDoc(sections, mainTitle, options);
  doc.save(`${filename.replace(/\.pdf$/i, "")}.pdf`);
}

export async function getSectionsPdfBlob(
  sections: PdfSection[],
  mainTitle?: string,
  options?: PdfBuildOptions,
): Promise<Blob> {
  const doc = await buildSectionsPdfDoc(sections, mainTitle, options);
  return doc.output("blob");
}
