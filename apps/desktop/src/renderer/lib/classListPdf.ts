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
  last_name?: string | null;
  first_name?: string | null;
  room_name?: string | null;
  code?: string | null;
  nisu?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  gender?: string | null;
  phone?: string | null;
  parent_phone?: string | null;
  parents?: string | null;
  address?: string | null;
  average?: string | null;
  decision?: string | null;
  photo_url?: string | null;
};

export const CLASS_LIST_FIELDS = [
  "photo",
  "last_name",
  "first_name",
  "room",
  "code",
  "nisu",
  "birth_date",
  "birth_place",
  "gender",
  "phone",
  "parent_phone",
  "parents",
  "address",
  "average",
  "decision",
] as const;

const CLASS_LIST_HEADERS: Record<(typeof CLASS_LIST_FIELDS)[number], string> = {
  photo: "Photo",
  last_name: "Nom",
  first_name: "Prénom",
  room: "Salle",
  code: "Code",
  nisu: "NISU",
  birth_date: "Naissance",
  birth_place: "Lieu de naissance",
  gender: "Sexe",
  phone: "Téléphone",
  parent_phone: "Tél. parent",
  parents: "Parents",
  address: "Adresse",
  average: "Moyenne",
  decision: "Décision",
};

const BASE_FIELDS = new Set(["last_name", "first_name", "room"]);

async function loadImage(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function cellText(student: ClassListStudent, field: string): string {
  if (field === "photo") return "";
  if (field === "room") return student.room_name?.trim() || "Sans salle";
  const value = student[field as keyof ClassListStudent];
  return value == null || value === "" ? "—" : String(value);
}

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

export async function getPrintableClassListPdfBlob(params: {
  school: ClassListSchool;
  className: string;
  roomName?: string | null;
  yearName?: string;
  students: ClassListStudent[];
  fields?: string[];
}): Promise<Blob> {
  const fields = (params.fields?.length ? params.fields : ["last_name", "first_name", "room"]).filter((id) =>
    id in CLASS_LIST_HEADERS,
  );
  const students = sortedStudents(params.students);
  const documentTitle = params.roomName
    ? `${params.className} — ${params.roomName}`
    : params.className;
  const withPhoto = fields.includes("photo");
  const classic = fields.every((id) => BASE_FIELDS.has(id));
  const columns = [
    ...fields.map((id) => CLASS_LIST_HEADERS[id as keyof typeof CLASS_LIST_HEADERS]),
    ...(classic ? BLANK_COLS.map((c) => c.header) : []),
  ];
  const photos = withPhoto ? await Promise.all(students.map((s) => loadImage(s.photo_url))) : [];
  const body = students.map((s) => [
    ...fields.map((id) => cellText(s, id)),
    ...(classic ? ["", "", ""] : []),
  ]);

  const doc = new jsPDF({
    orientation: fields.length > 6 || withPhoto ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const startY = drawHeader(
    doc,
    params.school,
    documentTitle,
    params.yearName,
    students.length,
  );
  const photoIndex = fields.indexOf("photo");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (autoTable as (doc: any, options: any) => void)(doc, {
    startY,
    head: [columns],
    body,
    theme: "grid",
    styles: {
      fontSize: fields.length > 8 ? 7.5 : 9,
      cellPadding: 2,
      minCellHeight: withPhoto ? 16 : 8,
      valign: "middle",
    },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    margin: { left: 10, right: 10 },
    didDrawCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { x: number; y: number } }) => {
      if (data.section !== "body" || data.column.index !== photoIndex) return;
      const img = photos[data.row.index];
      if (!img) return;
      const format = img.startsWith("data:image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(img, format, data.cell.x + 1.2, data.cell.y + 1.2, 12, 13.5);
      } catch {
        /* photo illisible */
      }
    },
  });

  return doc.output("blob");
}
