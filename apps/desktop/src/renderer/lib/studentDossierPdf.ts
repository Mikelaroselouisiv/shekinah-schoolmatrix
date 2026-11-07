import type { PdfSection } from "@/lib/pdfExport";
import { getSectionsPdfBlob } from "@/lib/pdfExport";
import { formatDateJJMMAAAA } from "@/lib/format";
import { formatPointsOnBareme } from "@/lib/gradeScale";
import { preschoolFrequencyLabel, preschoolLevelLabel } from "@/lib/preschoolScale";

const DECISION_LABELS: Record<string, string> = {
  ADMIS: "Admis",
  ADMIS_AILLEURS: "Admis ailleurs",
  REDOUBLER: "Redoubler",
  AJOURNE: "Ajourné",
  RENVOYE: "Renvoyé",
  RENVOYE_DEFINITIVEMENT: "Renvoyé définitivement",
  EXPELLED: "Exclu",
};

const ARCHIVE_LABELS: Record<string, string> = {
  REMOVED: "Retiré de l’année",
  GRADUATED: "Fin de cycle (ancien élève)",
};

export type StudentDossierYear = {
  academic_year_id: string;
  academic_year_name: string;
  class_id: string | null;
  class_name: string | null;
  class_level?: string | null;
  is_preschool?: boolean;
  decision: string | null;
  average: number | null;
  exam_results?: {
    periods?: { id: string; name: string }[];
    subjects?: {
      subject_name: string;
      periods: { period_id: string; grade_value: number; coefficient: number }[];
    }[];
  } | null;
  preschool_results?: {
    periods?: { id: string; name: string }[];
    subjects?: { id: string; name: string }[];
    cells?: Record<string, { level?: string; frequency?: string; observation?: string }>;
  } | null;
  payment?: {
    academic_year?: string;
    by_service?: {
      service_name: string;
      due_date?: string | null;
      amount_due: number;
      total_paid: number;
      balance: number;
    }[];
  } | null;
};

export type StudentDossier = {
  student: {
    first_name: string;
    last_name: string;
    management_code?: string | null;
    order_number?: string | null;
    class_name?: string | null;
    room_name?: string | null;
    birth_date?: string | Date | null;
    birth_place?: string | null;
    gender?: string | null;
    phone?: string | null;
    address?: string | null;
    mother_name?: string | null;
    mother_phone?: string | null;
    father_name?: string | null;
    father_phone?: string | null;
    responsible_name?: string | null;
    responsible_phone?: string | null;
    archived_at?: string | Date | null;
    archive_reason?: string | null;
    is_alumni?: boolean;
  };
  years: StudentDossierYear[];
  discipline?: {
    disciplinary_points?: number;
    lateness_count?: number;
    absence_count?: number;
    latest_measure?: { label?: string; reason?: string } | null;
  } | null;
};

export const DOSSIER_PDF_FIELDS = [
  "code",
  "nisu",
  "classe",
  "salle",
  "birth_date",
  "birth_place",
  "gender",
  "phone",
  "address",
  "status",
  "mother",
  "mother_phone",
  "father",
  "father_phone",
  "responsible",
  "responsible_phone",
  "parcours",
  "average",
  "decision",
  "grades",
  "preschool",
  "discipline",
  "economat",
] as const;

export type DossierPdfField = (typeof DOSSIER_PDF_FIELDS)[number];

function genderLabel(value?: string | null): string {
  if (value === "M") return "Masculin";
  if (value === "F") return "Féminin";
  return value?.trim() || "—";
}

function has(fields: Set<string> | undefined, id: string): boolean {
  return !fields || fields.has(id);
}

export function buildStudentDossierSections(
  dossier: StudentDossier,
  fields?: Set<string>,
): PdfSection[] {
  const s = dossier.student;
  const sections: PdfSection[] = [];
  const identity = [
    `Nom : ${s.last_name} ${s.first_name}`,
    has(fields, "code") ? `Code de gestion : ${s.management_code ?? "—"}` : "",
    has(fields, "nisu") ? `NISU : ${s.order_number ?? "—"}` : "",
    has(fields, "classe") ? `Classe : ${s.class_name ?? "—"}` : "",
    has(fields, "salle") ? `Salle : ${s.room_name ?? "—"}` : "",
    has(fields, "birth_date")
      ? `Date de naissance : ${s.birth_date ? formatDateJJMMAAAA(String(s.birth_date)) : "—"}`
      : "",
    has(fields, "birth_place") ? `Lieu de naissance : ${s.birth_place ?? "—"}` : "",
    has(fields, "gender") ? `Sexe : ${genderLabel(s.gender)}` : "",
    has(fields, "phone") ? `Téléphone : ${s.phone ?? "—"}` : "",
    has(fields, "address") ? `Adresse : ${s.address ?? "—"}` : "",
    has(fields, "mother") ? `Mère : ${s.mother_name ?? "—"}` : "",
    has(fields, "mother_phone") ? `Téléphone mère : ${s.mother_phone ?? "—"}` : "",
    has(fields, "father") ? `Père : ${s.father_name ?? "—"}` : "",
    has(fields, "father_phone") ? `Téléphone père : ${s.father_phone ?? "—"}` : "",
    has(fields, "responsible") ? `Responsable : ${s.responsible_name ?? "—"}` : "",
    has(fields, "responsible_phone") ? `Téléphone responsable : ${s.responsible_phone ?? "—"}` : "",
    has(fields, "status")
      ? s.is_alumni
        ? `Statut : ancien élève${s.archive_reason ? ` (${ARCHIVE_LABELS[s.archive_reason] ?? s.archive_reason})` : ""}`
        : "Statut : élève en cours"
      : "",
  ].filter(Boolean);
  if (identity.length) sections.push({ title: "Identité", lines: identity });

  const showYear = has(fields, "parcours") || has(fields, "average") || has(fields, "decision");
  if (showYear) {
    const columns = [
      { header: "Année", key: "year" },
      ...(has(fields, "parcours") ? [{ header: "Classe", key: "class_name" }] : []),
      ...(has(fields, "average") ? [{ header: "Moyenne", key: "average" }] : []),
      ...(has(fields, "decision") ? [{ header: "Décision", key: "decision" }] : []),
    ];
    sections.push({
      title: "Parcours scolaire",
      table: {
        columns,
        rows: (dossier.years ?? []).map((y) => ({
          year: y.academic_year_name,
          class_name: y.class_name ?? "—",
          average: y.average != null ? y.average.toFixed(2) : "—",
          decision: y.decision ? (DECISION_LABELS[y.decision] ?? y.decision) : "—",
        })),
      },
    });
  }

  if (has(fields, "discipline") && dossier.discipline) {
    const d = dossier.discipline;
    sections.push({
      title: "Situation disciplinaire",
      lines: [
        `Points disciplinaires : ${d.disciplinary_points ?? "—"} / 100`,
        `Retards : ${d.lateness_count ?? 0} · Absences : ${d.absence_count ?? 0}`,
        d.latest_measure?.label
          ? `Dernière mesure : ${d.latest_measure.label}${d.latest_measure.reason ? ` — ${d.latest_measure.reason}` : ""}`
          : "Dernière mesure : —",
      ],
    });
  }

  for (const year of dossier.years ?? []) {
    const yearTitle = `${year.academic_year_name}${year.class_name ? ` — ${year.class_name}` : ""}`;

    if (has(fields, "economat") && year.payment?.by_service?.length) {
      sections.push({
        title: `Paiements — ${yearTitle}`,
        table: {
          columns: [
            { header: "Service", key: "service_name" },
            { header: "Échéance", key: "due_date" },
            { header: "Montant", key: "amount_due" },
            { header: "Versé", key: "total_paid" },
            { header: "Balance", key: "balance" },
          ],
          rows: year.payment.by_service.map((svc) => ({
            service_name: svc.service_name,
            due_date: svc.due_date ? formatDateJJMMAAAA(svc.due_date) : "—",
            amount_due: String(svc.amount_due),
            total_paid: String(svc.total_paid),
            balance: String(svc.balance),
          })),
        },
      });
    }

    const exam = year.exam_results;
    if (has(fields, "grades") && exam?.subjects?.length && exam.periods?.length) {
      sections.push({
        title: `Notes — ${yearTitle}`,
        lines: [
          has(fields, "average")
            ? year.average != null
              ? `Moyenne générale : ${year.average.toFixed(2)} / 10`
              : "Moyenne générale : —"
            : "",
          has(fields, "decision")
            ? year.decision
              ? `Décision : ${DECISION_LABELS[year.decision] ?? year.decision}`
              : "Décision : —"
            : "",
        ].filter(Boolean),
        table: {
          columns: [
            { header: "Matière", key: "subject_name" },
            ...exam.periods.map((p, i) => ({ header: p.name, key: `period_${i}` })),
          ],
          rows: exam.subjects.map((subj) => {
            const row: Record<string, string> = { subject_name: subj.subject_name };
            exam.periods!.forEach((p, i) => {
              const g = subj.periods.find((gr) => gr.period_id === p.id);
              const pts = g?.grade_value != null ? Number(g.grade_value) : null;
              const coef = g?.coefficient != null ? Number(g.coefficient) : null;
              row[`period_${i}`] = pts != null && coef != null ? formatPointsOnBareme(pts, coef) : "—";
            });
            return row;
          }),
        },
      });
    }

    const pre = year.preschool_results;
    if (has(fields, "preschool") && pre?.subjects?.length && pre.periods?.length) {
      sections.push({
        title: `Évaluations préscolaires — ${yearTitle}`,
        table: {
          columns: [
            { header: "Domaine", key: "subject_name" },
            ...pre.periods.map((p, i) => ({ header: p.name, key: `period_${i}` })),
          ],
          rows: pre.subjects.map((subj) => {
            const row: Record<string, string> = { subject_name: subj.name };
            pre.periods!.forEach((p, i) => {
              const cell = pre.cells?.[`${subj.id}:${p.id}`];
              row[`period_${i}`] = [
                preschoolLevelLabel(cell?.level),
                preschoolFrequencyLabel(cell?.frequency),
                cell?.observation,
              ]
                .filter(Boolean)
                .join(" · ") || "—";
            });
            return row;
          }),
        },
      });
    }
  }

  return sections;
}

export async function getStudentDossierPdfBlob(
  dossier: StudentDossier,
  fields?: Set<string>,
): Promise<Blob> {
  const s = dossier.student;
  return getSectionsPdfBlob(
    buildStudentDossierSections(dossier, fields),
    `Dossier scolaire — ${s.last_name} ${s.first_name}`,
  );
}
