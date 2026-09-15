/**
 * Listes de classe / salle imprimables (pas des carnets de notes).
 * En-tête : établissement, e-mail, téléphone, classe (et salle si fournie).
 * Colonnes : Nom, Prénom, Salle + colonnes vides pour annotations manuscrites.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ClassListSchool = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type ClassListStudent = {
  last_name: string;
  first_name: string;
  room_name?: string | null;
};

const BLANK_COLS = [
  { header: " ", key: "b1" },
  { header: " ", key: "b2" },
  { header: " ", key: "b3" },
] as const;

function sortedStudents(students: ClassListStudent[]): ClassListStudent[] {
  return students.slice().sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr"),
  );
}

function drawHeader(
  doc: jsPDF,
  school: ClassListSchool,
  documentTitle: string,
  yearName: string | undefined,
  count: number,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text((school.name || "Établissement").trim(), pageW / 2, y, { align: "center" });
  y += 6;

  const contact = [school.email?.trim(), school.phone?.trim()].filter(Boolean).join("   ·   ");
  if (contact) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(contact, pageW / 2, y, { align: "center" });
    y += 6;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, y, pageW - 14, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(documentTitle, 14, y);
  y += 6;

  const meta = [
    yearName?.trim(),
    `${count} élève${count !== 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (meta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(meta, 14, y);
    y += 4;
  }

  return y + 3;
}

export function getPrintableClassListPdfBlob(params: {
  school: ClassListSchool;
  className: string;
  roomName?: string | null;
  yearName?: string;
  students: ClassListStudent[];
}): Blob {
  const students = sortedStudents(params.students);
  const documentTitle = params.roomName
    ? `${params.className} — ${params.roomName}`
    : params.className;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const startY = drawHeader(
    doc,
    params.school,
    documentTitle,
    params.yearName,
    students.length,
  );

  const columns = [
    { header: "Nom", key: "last_name" },
    { header: "Prénom", key: "first_name" },
    { header: "Salle", key: "room_name" },
    ...BLANK_COLS,
  ];
  const body = students.map((s) => [
    s.last_name || "—",
    s.first_name || "—",
    s.room_name?.trim() || "Sans salle",
    "",
    "",
    "",
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (autoTable as (doc: any, options: any) => void)(doc, {
    startY,
    head: [columns.map((c) => c.header)],
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.4, minCellHeight: 8, valign: "middle" },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 38 },
      2: { cellWidth: 28 },
      3: { cellWidth: 24 },
      4: { cellWidth: 24 },
      5: { cellWidth: 24 },
    },
    margin: { left: 14, right: 14 },
  });

  return doc.output("blob");
}
