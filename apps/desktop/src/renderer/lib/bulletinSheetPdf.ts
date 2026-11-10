import { jsPDF } from "jspdf";

export type BulletinSchool = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
};

export type SheetStudent = {
  id: string;
  first_name: string;
  last_name: string;
  room_id?: string | null;
  room_name?: string | null;
  decision?: string | null;
};

export type SheetPeriod = { id: string; name: string };
export type SheetSubject = { id: string; name: string };

type GradeCell = {
  period_id: string;
  coefficient?: number;
  grade_value?: number | null;
  has_grade?: boolean;
};

export type SchoolResults = {
  subjects?: { subject_id: string; subject_name?: string; periods?: GradeCell[] }[];
};

export type PreschoolResults = {
  cells?: Record<string, { level?: string; frequency?: string; observation?: string }>;
};

type Identity = {
  lastName: string;
  firstName: string;
  className: string;
  roomName: string;
  decision: string;
};

export type SchoolSheet = {
  identity: Identity;
  periodLabels: string[];
  subjects: { name: string; coefficient: number | null; points: (number | null)[] }[];
  pointTotals: (number | null)[];
  coefficientTotal: number | null;
  averages: (number | null)[];
  places: (number | null)[];
  effectif: number;
  moyenneGenerale: number | null;
  placeGenerale: number | null;
  moyenneClasse: number | null;
};

export type PreschoolSheet = {
  identity: Identity;
  periodLabels: string[];
  subjects: { name: string; marks: string[] }[];
};

type Page =
  | { type: "school"; sheet: SchoolSheet }
  | { type: "preschool"; sheet: PreschoolSheet };

function pdfText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtPoints(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : String(r);
}

function fmtAvg(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  return round2(n).toFixed(2);
}

function ranksOf(scores: { id: string; score: number | null }[]): Map<string, number> {
  const ranked = scores
    .filter((s): s is { id: string; score: number } => s.score != null)
    .map((s) => ({ ...s, score: round2(s.score) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const out = new Map<string, number>();
  let last: number | null = null;
  let place = 0;
  ranked.forEach((row, index) => {
    if (last == null || row.score !== last) {
      place = index + 1;
      last = row.score;
    }
    out.set(row.id, place);
  });
  return out;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

function periodLabels(periods: SheetPeriod[]): string[] {
  if (periods.length === 1) return [periods[0].name || "Cont. 1"];
  return periods.map((_, i) => `Cont. ${i + 1}`);
}

function schoolNumbers(
  result: SchoolResults | undefined,
  subjects: SheetSubject[],
  periods: SheetPeriod[],
): {
  rows: { name: string; coefficient: number | null; points: (number | null)[] }[];
  coefficientTotal: number | null;
  pointTotals: (number | null)[];
  averages: (number | null)[];
} {
  const byId = new Map((result?.subjects ?? []).map((s) => [s.subject_id, s]));
  const rows = subjects.map((subject) => {
    const found = byId.get(subject.id);
    const grades = found?.periods ?? [];
    let coefficient: number | null = null;
    const points = periods.map((period) => {
      const grade = grades.find((g) => g.period_id === period.id);
      const coef = Number(grade?.coefficient);
      if (coefficient == null && coef > 0) coefficient = coef;
      if (!grade?.has_grade || grade.grade_value == null) return null;
      return Number(grade.grade_value);
    });
    return { name: subject.name, coefficient, points };
  });
  const counted = rows.filter((row) => row.coefficient != null && row.coefficient > 0);
  const coefficientTotal = counted.reduce((s, row) => s + (row.coefficient ?? 0), 0);
  const pointTotals = periods.map((_, index) => {
    const any = counted.some((row) => row.points[index] != null);
    if (!any) return null;
    return counted.reduce((s, row) => s + (row.points[index] ?? 0), 0);
  });
  const averages = pointTotals.map((points) =>
    points == null || !(coefficientTotal > 0) ? null : (points / coefficientTotal) * 10,
  );
  return {
    rows,
    coefficientTotal: coefficientTotal > 0 ? coefficientTotal : null,
    pointTotals,
    averages,
  };
}

function groupKey(student: SheetStudent): string {
  return student.room_id || "__sans_salle__";
}

export function composeSchoolSheets(args: {
  className: string;
  students: SheetStudent[];
  pickedIds: string[];
  periods: SheetPeriod[];
  subjects: SheetSubject[];
  results: Map<string, SchoolResults>;
  decisionLabel: (value?: string | null) => string;
}): SchoolSheet[] {
  const labels = periodLabels(args.periods);
  const computed = new Map<string, ReturnType<typeof schoolNumbers> & { generale: number | null }>();
  for (const student of args.students) {
    const numbers = schoolNumbers(args.results.get(student.id), args.subjects, args.periods);
    const generale = mean(numbers.averages.filter((n): n is number => n != null));
    computed.set(student.id, { ...numbers, generale });
  }

  const groups = new Map<string, SheetStudent[]>();
  for (const student of args.students) {
    const key = groupKey(student);
    const list = groups.get(key) ?? [];
    list.push(student);
    groups.set(key, list);
  }

  const placeByStudent = new Map<string, { places: (number | null)[]; generale: number | null; classe: number | null; effectif: number }>();
  for (const group of groups.values()) {
    const periodPlaces = args.periods.map((_, index) =>
      ranksOf(group.map((student) => ({ id: student.id, score: computed.get(student.id)?.averages[index] ?? null }))),
    );
    const generalPlaces = ranksOf(group.map((student) => ({ id: student.id, score: computed.get(student.id)?.generale ?? null })));
    const classe = mean(
      group
        .map((student) => computed.get(student.id)?.generale)
        .filter((n): n is number => n != null),
    );
    for (const student of group) {
      placeByStudent.set(student.id, {
        places: periodPlaces.map((map) => map.get(student.id) ?? null),
        generale: generalPlaces.get(student.id) ?? null,
        classe,
        effectif: group.length,
      });
    }
  }

  const picked = new Set(args.pickedIds);
  return args.students
    .filter((student) => picked.has(student.id))
    .map((student) => {
      const numbers = computed.get(student.id)!;
      const place = placeByStudent.get(student.id)!;
      return {
        identity: {
          lastName: student.last_name,
          firstName: student.first_name,
          className: args.className,
          roomName: student.room_name?.trim() || "",
          decision: args.decisionLabel(student.decision),
        },
        periodLabels: labels,
        subjects: numbers.rows,
        pointTotals: numbers.pointTotals,
        coefficientTotal: numbers.coefficientTotal,
        averages: numbers.averages,
        places: place.places,
        effectif: place.effectif,
        moyenneGenerale: numbers.generale,
        placeGenerale: place.generale,
        moyenneClasse: place.classe,
      };
    })
    .sort((a, b) => {
      const ag = a.moyenneGenerale ?? -1;
      const bg = b.moyenneGenerale ?? -1;
      if (bg !== ag) return bg - ag;
      return a.identity.lastName.localeCompare(b.identity.lastName, "fr");
    });
}

export function composePreschoolSheets(args: {
  className: string;
  students: SheetStudent[];
  pickedIds: string[];
  periods: SheetPeriod[];
  subjects: SheetSubject[];
  results: Map<string, PreschoolResults>;
  mark: (cell?: { level?: string; frequency?: string; observation?: string }) => string;
  decisionLabel: (value?: string | null) => string;
}): PreschoolSheet[] {
  const labels = periodLabels(args.periods);
  const picked = new Set(args.pickedIds);
  return args.students
    .filter((student) => picked.has(student.id))
    .map((student) => {
      const cells = args.results.get(student.id)?.cells ?? {};
      return {
        identity: {
          lastName: student.last_name,
          firstName: student.first_name,
          className: args.className,
          roomName: student.room_name?.trim() || "",
          decision: args.decisionLabel(student.decision),
        },
        periodLabels: labels,
        subjects: args.subjects.map((subject) => ({
          name: subject.name,
          marks: args.periods.map((period) => args.mark(cells[`${subject.id}:${period.id}`])),
        })),
      };
    })
    .sort((a, b) => a.identity.lastName.localeCompare(b.identity.lastName, "fr") || a.identity.firstName.localeCompare(b.identity.firstName, "fr"));
}

async function loadLogo(url?: string | null): Promise<string | null> {
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
            const max = 180;
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

function fit(doc: jsPDF, text: string, width: number): string {
  const value = pdfText(text || "");
  if (!value) return "";
  if (doc.getTextWidth(value) <= width) return value;
  let cut = value;
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut}...`;
}

function drawBanner(
  doc: jsPDF,
  school: BulletinSchool | null,
  logo: string | null,
  yearName: string,
  subtitle: string,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = 9;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, y, 16, 16);
    } catch {
      /* logo illisible */
    }
  }
  const center = pageW / 2;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const name = pdfText((school?.name || "Etablissement").toUpperCase());
  const nameLines = doc.splitTextToSize(name, pageW - 78) as string[];
  doc.text(nameLines, center, y + 5, { align: "center" });
  let lineY = y + 5 + nameLines.length * 4.3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (school?.address?.trim()) {
    doc.text(pdfText(school.address.trim()), center, lineY, { align: "center" });
    lineY += 3.6;
  }
  const contact = [school?.phone?.trim(), school?.email?.trim()].filter(Boolean).join("   /   ");
  if (contact) {
    doc.text(pdfText(contact), center, lineY, { align: "center" });
    lineY += 3.6;
  }
  y = Math.max(y + 18, lineY + 1.2);
  doc.setDrawColor(25, 25, 25);
  doc.setLineWidth(0.45);
  doc.line(margin, y, pageW - margin, y);
  y += 4.6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(pdfText(`BULLETIN SCOLAIRE ${yearName}`.trim()), center, y, { align: "center" });
  y += 1.6;
  doc.line(margin, y, pageW - margin, y);
  y += 4;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(pdfText(subtitle), center, y, { align: "center" });
    y += 4;
  }
  return y + 1;
}

function paintCell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts?: { bold?: boolean; align?: "left" | "center"; size?: number; fill?: [number, number, number] },
) {
  if (opts?.fill) {
    doc.setFillColor(...opts.fill);
    doc.rect(x, y, w, h, "F");
  }
  doc.setDrawColor(35, 35, 35);
  doc.setLineWidth(0.15);
  doc.rect(x, y, w, h);
  if (!text) return;
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(opts?.size ?? 8);
  doc.setTextColor(20, 20, 20);
  const shown = fit(doc, text, w - 1.6);
  const baseline = y + h / 2 + 1.15;
  if (opts?.align === "center") doc.text(shown, x + w / 2, baseline, { align: "center" });
  else doc.text(shown, x + 1.1, baseline);
}

function drawIdentity(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  identity: Identity,
  stats: { classe?: string; generale?: string; place?: string } | null,
) {
  doc.setDrawColor(35, 35, 35);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  let ty = y + 4.4;
  const label = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(20, 20, 20);
    doc.text(pdfText(text), x + 2, ty);
    ty += 3.2;
  };
  const value = (text: string, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.text(fit(doc, text, w - 4), x + 2, ty);
    ty += 4.4;
  };
  label("Nom");
  value((identity.lastName || "").toUpperCase());
  label("Prénoms");
  value(identity.firstName);
  label("Classe");
  value(identity.className);
  if (identity.roomName) {
    label("Salle");
    value(identity.roomName);
  }
  if (stats) {
    ty += 2;
    label("Moyenne de la classe");
    value(stats.classe || "", 10);
    ty += 1.2;
    label("Moyenne générale");
    value(stats.generale || "", 10);
    if (stats.place) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(fit(doc, stats.place, w - 4), x + 2, ty);
      ty += 4;
    }
    ty += 1.2;
    label("Décision de fin d'année");
    value(identity.decision);
  } else {
    ty += 2;
    label("Décision de fin d'année");
    value(identity.decision);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Signature de la Direction", x + 2, y + h - 7);
  doc.setDrawColor(35, 35, 35);
  doc.setLineWidth(0.25);
  doc.line(x + 2, y + h - 3.2, x + w - 2.5, y + h - 3.2);
}

function columnWidths(tableW: number, periodCount: number, withCoef: boolean): { disc: number; coef: number; period: number } {
  const n = Math.max(periodCount, 1);
  const coef = withCoef ? 16 : 0;
  let disc = 44;
  let period = (tableW - coef - disc) / n;
  period = Math.min(28, Math.max(11, period));
  disc = tableW - coef - period * n;
  if (disc < 36) {
    disc = 36;
    period = (tableW - coef - disc) / n;
  }
  return { disc, coef, period };
}

function drawSchoolSheet(doc: jsPDF, top: number, sheet: SchoolSheet) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const rightW = 54;
  const tableW = pageW - margin * 2 - rightW;
  const n = Math.max(sheet.periodLabels.length, 1);
  const widths = columnWidths(tableW, n, true);
  const headH = 7;
  const footH = 5.4;
  const barH = 3.2;
  const maxBody = pageH - 8 - top - headH - barH - 4 * footH;
  const rowH = Math.min(6, Math.max(3.6, maxBody / Math.max(sheet.subjects.length, 1)));
  const blanks = sheet.subjects.length >= 24 ? 0 : Math.max(0, Math.floor((maxBody - sheet.subjects.length * rowH) / rowH));
  const bodyRows = sheet.subjects.length + blanks;
  const tableH = headH + bodyRows * rowH + barH + 4 * footH;
  const headFill: [number, number, number] = [232, 232, 232];
  const band: [number, number, number] = [30, 70, 130];

  let x = margin;
  let y = top;
  paintCell(doc, x, y, widths.disc, 7, "DISCIPLINES", { bold: true, size: 7, fill: headFill });
  x += widths.disc;
  paintCell(doc, x, y, widths.coef, headH, "Coefficient", { bold: true, align: "center", size: 6.2, fill: headFill });
  x += widths.coef;
  for (const label of sheet.periodLabels) {
    paintCell(doc, x, y, widths.period, 7, label, { bold: true, align: "center", size: 6.5, fill: headFill });
    x += widths.period;
  }
  y += 7;

  const paintSubject = (name: string, coef: string, points: string[]) => {
    let cx = margin;
    paintCell(doc, cx, y, widths.disc, rowH, name, { size: rowH < 4.4 ? 6.5 : 7.5 });
    cx += widths.disc;
    paintCell(doc, cx, y, widths.coef, rowH, coef, { align: "center", size: 7.5 });
    cx += widths.coef;
    for (let i = 0; i < n; i++) {
      paintCell(doc, cx, y, widths.period, rowH, points[i] ?? "", { align: "center", size: 7.5 });
      cx += widths.period;
    }
    y += rowH;
  };

  for (const subject of sheet.subjects) {
    paintSubject(
      subject.name,
      subject.coefficient != null ? fmtPoints(subject.coefficient) : "",
      subject.points.map((p) => fmtPoints(p)),
    );
  }
  for (let i = 0; i < blanks; i++) paintSubject("", "", []);

  doc.setFillColor(...band);
  doc.rect(margin, y, tableW, barH, "F");
  y += barH;

  const footer = (label: string, coef: string, cells: string[], bold = false) => {
    let cx = margin;
    paintCell(doc, cx, y, widths.disc, footH, label, { bold, size: 7.5 });
    cx += widths.disc;
    paintCell(doc, cx, y, widths.coef, footH, coef, { bold, align: "center", size: 7.5 });
    cx += widths.coef;
    for (let i = 0; i < n; i++) {
      paintCell(doc, cx, y, widths.period, footH, cells[i] ?? "", { bold, align: "center", size: 7 });
      cx += widths.period;
    }
    y += footH;
  };
  footer("Points", "", sheet.pointTotals.map((n) => fmtPoints(n)));
  footer("TOTAL", fmtPoints(sheet.coefficientTotal), sheet.averages.map((n) => fmtAvg(n)), true);
  footer("Moyenne", "/10", sheet.periodLabels.map(() => ""));
  footer(
    "Place",
    sheet.effectif ? String(sheet.effectif) : "",
    sheet.places.map((p) => (p == null ? "" : String(p))),
    true,
  );

  const place =
    sheet.placeGenerale != null && sheet.effectif
      ? `Place ${sheet.placeGenerale} / ${sheet.effectif}`
      : "";
  drawIdentity(doc, margin + tableW, top, rightW, tableH, sheet.identity, {
    classe: fmtAvg(sheet.moyenneClasse),
    generale: fmtAvg(sheet.moyenneGenerale),
    place,
  });
}

function drawPreschoolSheet(doc: jsPDF, top: number, sheet: PreschoolSheet) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const rightW = 54;
  const tableW = pageW - margin * 2 - rightW;
  const n = Math.max(sheet.periodLabels.length, 1);
  const widths = columnWidths(tableW, n, false);
  const maxBody = pageH - 10 - top;
  const rowH = Math.min(7, Math.max(4.2, (maxBody - 7) / Math.max(sheet.subjects.length, 8)));
  const blanks = sheet.subjects.length >= 20 ? 0 : Math.max(0, Math.floor((maxBody - 7 - sheet.subjects.length * rowH) / rowH));
  const tableH = 7 + (sheet.subjects.length + blanks) * rowH;
  const headFill: [number, number, number] = [232, 232, 232];

  let x = margin;
  let y = top;
  paintCell(doc, x, y, widths.disc, 7, "DISCIPLINES", { bold: true, size: 7, fill: headFill });
  x += widths.disc;
  for (const label of sheet.periodLabels) {
    paintCell(doc, x, y, widths.period, 7, label, { bold: true, align: "center", size: 6.5, fill: headFill });
    x += widths.period;
  }
  y += 7;
  const paintRow = (name: string, marks: string[]) => {
    let cx = margin;
    paintCell(doc, cx, y, widths.disc, rowH, name, { size: 7.5 });
    cx += widths.disc;
    for (let i = 0; i < n; i++) {
      paintCell(doc, cx, y, widths.period, rowH, marks[i] ?? "", { align: "center", size: 7 });
      cx += widths.period;
    }
    y += rowH;
  };
  for (const subject of sheet.subjects) paintRow(subject.name, subject.marks);
  for (let i = 0; i < blanks; i++) paintRow("", []);

  drawIdentity(doc, margin + tableW, top, rightW, tableH, sheet.identity, null);
}

export async function buildBulletinSheetsPdf(opts: {
  school: BulletinSchool | null;
  yearName: string;
  subtitle?: string;
  pages: Page[];
}): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const logo = await loadLogo(opts.school?.logo_url);
  const pages = opts.pages.length ? opts.pages : [];
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage();
    const top = drawBanner(doc, opts.school, logo, opts.yearName, opts.subtitle || "");
    if (page.type === "school") drawSchoolSheet(doc, top, page.sheet);
    else drawPreschoolSheet(doc, top, page.sheet);
  });
  if (!pages.length) {
    drawBanner(doc, opts.school, logo, opts.yearName, opts.subtitle || "");
  }
  return doc.output("blob");
}
