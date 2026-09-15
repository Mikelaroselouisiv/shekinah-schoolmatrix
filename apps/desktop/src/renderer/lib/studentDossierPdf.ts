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
    birth_date?: string | Date | null;
    gender?: string | null;
    mother_name?: string | null;
    father_name?: string | null;
    responsible_name?: string | null;
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

export function buildStudentDossierSections(dossier: StudentDossier): PdfSection[] {
  const s = dossier.student;
  const sections: PdfSection[] = [
    {
      title: "Identité",
      lines: [
        `Nom : ${s.last_name} ${s.first_name}`,
        `Code de gestion : ${s.management_code ?? "—"}`,
        ...(s.order_number ? [`NISU : ${s.order_number}`] : []),
        `Dernière classe : ${s.class_name ?? "—"}`,
        `Date de naissance : ${s.birth_date ? formatDateJJMMAAAA(String(s.birth_date)) : "—"}`,
        `Genre : ${s.gender ?? "—"}`,
        `Mère : ${s.mother_name ?? "—"}`,
        `Père : ${s.father_name ?? "—"}`,
        `Responsable : ${s.responsible_name ?? "—"}`,
        s.is_alumni
          ? `Statut : ancien élève${s.archive_reason ? ` (${ARCHIVE_LABELS[s.archive_reason] ?? s.archive_reason})` : ""}`
          : "Statut : élève en cours",
      ],
    },
    {
      title: "Parcours scolaire",
      table: {
        columns: [
          { header: "Année", key: "year" },
          { header: "Classe", key: "class_name" },
          { header: "Moyenne", key: "average" },
          { header: "Décision", key: "decision" },
        ],
        rows: (dossier.years ?? []).map((y) => ({
          year: y.academic_year_name,
          class_name: y.class_name ?? "—",
          average: y.average != null ? y.average.toFixed(2) : "—",
          decision: y.decision ? (DECISION_LABELS[y.decision] ?? y.decision) : "—",
        })),
      },
    },
  ];

  if (dossier.discipline) {
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

    if (year.payment?.by_service?.length) {
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
    if (exam?.subjects?.length && exam.periods?.length) {
      sections.push({
        title: `Moyennes — ${yearTitle}`,
        lines: [
          year.average != null ? `Moyenne générale : ${year.average.toFixed(2)} / 10` : "Moyenne générale : —",
          year.decision ? `Décision : ${DECISION_LABELS[year.decision] ?? year.decision}` : "",
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
    if (pre?.subjects?.length && pre.periods?.length) {
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

export async function getStudentDossierPdfBlob(dossier: StudentDossier): Promise<Blob> {
  const s = dossier.student;
  return getSectionsPdfBlob(
    buildStudentDossierSections(dossier),
    `Dossier scolaire — ${s.last_name} ${s.first_name}`,
  );
}
