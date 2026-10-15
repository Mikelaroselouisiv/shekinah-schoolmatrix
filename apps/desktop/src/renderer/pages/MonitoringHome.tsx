import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getImageUrl, useSchoolProfile } from "@/context/SchoolProfileContext";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { canSeeMonitoringFinance } from "@/lib/dashboardRoles";
import { EDUCATION_LEVELS, educationLevelLabel } from "@/lib/educationLevels";
import { getSectionsPdfBlob, type PdfSection } from "@/lib/pdfExport";
import {
  countStatus,
  dueNowTotal,
  formatAverage,
  formatClock,
  formatLongDate,
  formatNumber,
  formatPercent,
  formatShortDate,
  haitiMonthStart,
  haitiToday,
  kindLabel,
  loadClassAttendance,
  loadDueFees,
  loadMeasureHistory,
  loadMonitorDetails,
  loadPeriodAverages,
  loadPresenceBoard,
  loadStudentAttendance,
  monitoringPdf,
  namedAbsents,
  presenceCards,
  rollTotals,
  searchStudents,
  statusLabel,
  studentLabel,
  studentPdf,
  type AttendanceRecord,
  type ClassDay,
  type DueFee,
  type MeasureHistoryItem,
  type PeriodAverage,
  type PresenceCard,
  type AcademicStudent,
  type MonitorSection,
  type MonitorSnapshot,
  type SearchHit,
} from "@/lib/monitoringLoad";

type Dossier = "presences" | "moyennes" | "economat" | "sanctions";

const SECTIONS: { id: MonitorSection; label: string; money?: boolean }[] = [
  { id: "jour", label: "Aujourd'hui" },
  { id: "presences", label: "Présences" },
  { id: "argent", label: "Finance", money: true },
  { id: "discipline", label: "Discipline" },
  { id: "moyennes", label: "Moyennes" },
  { id: "travaux", label: "Leçons et devoirs" },
];

function Stat({
  value,
  label,
  tone = "ink",
}: {
  value: string;
  label: string;
  tone?: "ink" | "good" | "alert" | "wait";
}) {
  return (
    <div className={`monitor-stat monitor-stat-${tone}`}>
      <p className="monitor-stat-value">{value}</p>
      <p className="monitor-stat-label">{label}</p>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <p className="monitor-empty">{empty}</p>;
  return (
    <div className="monitor-table-wrap">
      <table className="monitor-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NameButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="monitor-name">
      {children}
    </button>
  );
}

function StatButton({
  value,
  label,
  tone = "ink",
  onClick,
}: {
  value: string;
  label: string;
  tone?: "ink" | "good" | "alert" | "wait";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`monitor-stat monitor-card monitor-stat-${tone}`}>
      <p className="monitor-stat-value">{value}</p>
      <p className="monitor-stat-label">{label}</p>
    </button>
  );
}

function presenceCycles(cards: PresenceCard[]) {
  const order = EDUCATION_LEVELS.map((item) => item.key);
  const groups = new Map<string, PresenceCard[]>();
  for (const card of cards) {
    const key = (card.level || "AUTRE").toUpperCase();
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0] as (typeof order)[number]);
      const ib = order.indexOf(b[0] as (typeof order)[number]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([key, items]) => ({
      key,
      label: key === "AUTRE" ? "Autre" : educationLevelLabel(key),
      cards: items,
    }));
}

function StatusText({ status }: { status: string }) {
  const tone =
    status === "Présent" ? "st-present" :
    status === "Absent" ? "st-absent" :
    status === "Retard" ? "st-late" :
    status === "Non appelé" ? "st-miss" : "";
  return <span className={tone}>{status}</span>;
}

export function MonitoringHome() {
  const { roleName, rolePermissions, school } = useSchoolProfile();
  const showMoney = canSeeMonitoringFinance(roleName, rolePermissions);
  const sections = SECTIONS.filter((s) => showMoney || !s.money);
  const [section, setSection] = useState<MonitorSection>("jour");
  const [data, setData] = useState<MonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsReady, setDetailsReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [attFrom, setAttFrom] = useState(haitiMonthStart);
  const [attTo, setAttTo] = useState(haitiToday);
  const [attStatus, setAttStatus] = useState("");
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [periodAverages, setPeriodAverages] = useState<PeriodAverage[]>([]);
  const [avgLoading, setAvgLoading] = useState(false);
  const [dueFees, setDueFees] = useState<DueFee[]>([]);
  const [feeLoading, setFeeLoading] = useState(false);
  const [sanctionHistory, setSanctionHistory] = useState<MeasureHistoryItem[]>([]);
  const [sanctionLoading, setSanctionLoading] = useState(false);
  const [roomPick, setRoomPick] = useState<PresenceCard | null>(null);
  const [roomFrom, setRoomFrom] = useState(haitiMonthStart);
  const [roomTo, setRoomTo] = useState(haitiToday);
  const [roomDays, setRoomDays] = useState<ClassDay[]>([]);
  const [roomLoading, setRoomLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetailsReady(false);
    (async () => {
      try {
        const board = await loadPresenceBoard();
        if (cancelled) return;
        setData({
          ...board,
          measures: [],
          latenesses: [],
          schoolAverage: null,
          successRate: null,
          gradedStudents: 0,
          threshold: null,
          byClass: [],
          byTeacher: [],
          averages: new Map(),
          works: [],
          collectedToday: null,
          collectionRate: null,
          studentsWithBalance: null,
          balance: null,
          paymentsToday: [],
          debtors: [],
        });
        setLoading(false);
        try {
          const details = await loadMonitorDetails(board.today, board.context, showMoney);
          if (!cancelled) setData((prev) => (prev ? { ...prev, ...details } : prev));
        } catch {
          /* les présences restent affichées */
        } finally {
          if (!cancelled) setDetailsReady(true);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMoney, reloadKey]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchStudents(q)
        .then((rows) => {
          if (!cancelled) setHits(rows);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    setAttFrom(haitiMonthStart());
    setAttTo(haitiToday());
    setAttStatus("");
    setDossier(null);
    setAttendance([]);
    setPeriodAverages([]);
    setDueFees([]);
    setSanctionHistory([]);
    setAvgLoading(Boolean(picked?.id));
    setFeeLoading(false);
    setAttLoading(false);
    setSanctionLoading(false);
  }, [picked?.id]);

  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    const studentId = picked.id;
    const yearId = data?.context.yearId ?? null;
    const yearName = data?.context.yearName ?? null;
    setAvgLoading(true);
    loadPeriodAverages(studentId, yearId)
      .then((rows) => {
        if (!cancelled) setPeriodAverages(rows);
      })
      .catch(() => {
        if (!cancelled) setPeriodAverages([]);
      })
      .finally(() => {
        if (cancelled) return;
        setAvgLoading(false);
        if (!showMoney) return;
        setFeeLoading(true);
        loadDueFees(studentId, yearName)
          .then((rows) => {
            if (!cancelled) setDueFees(rows);
          })
          .catch(() => {
            if (!cancelled) setDueFees([]);
          })
          .finally(() => {
            if (!cancelled) setFeeLoading(false);
          });
      });
    return () => {
      cancelled = true;
    };
  }, [picked, data?.context.yearId, data?.context.yearName, showMoney]);

  useEffect(() => {
    if (!picked || dossier !== "presences") return;
    let cancelled = false;
    setAttLoading(true);
    loadStudentAttendance(picked.id, attFrom, attTo)
      .then((rows) => {
        if (!cancelled) setAttendance(rows);
      })
      .catch(() => {
        if (!cancelled) setAttendance([]);
      })
      .finally(() => {
        if (!cancelled) setAttLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [picked, dossier, attFrom, attTo]);

  useEffect(() => {
    if (!picked || dossier !== "sanctions") return;
    let cancelled = false;
    setSanctionLoading(true);
    loadMeasureHistory(picked.id)
      .then((rows) => {
        if (!cancelled) setSanctionHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setSanctionHistory([]);
      })
      .finally(() => {
        if (!cancelled) setSanctionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [picked, dossier]);

  useEffect(() => {
    if (!roomPick) return;
    let cancelled = false;
    setRoomLoading(true);
    loadClassAttendance(roomPick.class_id, roomFrom, roomTo, roomPick.room_id)
      .then((rows) => {
        if (!cancelled) setRoomDays(rows);
      })
      .catch(() => {
        if (!cancelled) setRoomDays([]);
      })
      .finally(() => {
        if (!cancelled) setRoomLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomPick, roomFrom, roomTo]);

  useEffect(() => {
    if (!dossier && !roomPick) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (dossier) setDossier(null);
      else setRoomPick(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dossier, roomPick]);

  const pdf = useMemo(() => {
    if (!data) return null;
    return monitoringPdf(section, data, showMoney);
  }, [data, section, showMoney]);

  const totals = data ? rollTotals(data.rolls) : null;
  const absents = data ? namedAbsents(data.rolls) : [];
  const pickedStatus = picked && data ? statusFor(data, picked.id) : "—";
  const pickedSanction = picked && data ? measureLabel(data, picked.id) : "—";
  const cardAverage = headlineAverage(periodAverages, data?.context.periodName ?? null);

  function openStudent(hit: SearchHit) {
    setPicked(data ? withClass(data, hit) : hit);
    setQuery("");
    setHits([]);
  }

  const visibleAttendance = attendance.filter((row) => !attStatus || row.status === attStatus);
  const owedNow = dueNowTotal(dueFees);
  const pickedName = picked ? studentLabel(picked.first_name, picked.last_name) : "";
  const dossierBusy =
    dossier === "presences" ? attLoading :
    dossier === "moyennes" ? avgLoading :
    dossier === "economat" ? avgLoading || feeLoading :
    dossier === "sanctions" ? sanctionLoading :
    false;
  const dossierTitle =
    dossier === "presences" ? "Présences" :
    dossier === "moyennes" ? "Moyennes" :
    dossier === "economat" ? "Économat" :
    dossier === "sanctions" ? "Sanctions" : "";

  function pdfOptions() {
    return {
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
  }

  async function exportStudent() {
    if (!picked) throw new Error("Aucun élève");
    const yearId = data?.context.yearId ?? null;
    const yearName = data?.context.yearName ?? null;
    const [periods, fees, rows, sanctions] = await Promise.all([
      loadPeriodAverages(picked.id, yearId),
      showMoney ? loadDueFees(picked.id, yearName) : Promise.resolve(null),
      loadStudentAttendance(picked.id, attFrom, attTo),
      loadMeasureHistory(picked.id),
    ]);
    const doc = studentPdf({
      name: studentLabel(picked.first_name, picked.last_name),
      klass: picked.class_name || "—",
      today: data?.today ?? "",
      status: data ? statusFor(data, picked.id) : "—",
      measure: data ? measureFor(data, picked.id) : "—",
      attendance: rows.filter((row) => !attStatus || row.status === attStatus),
      periods,
      fees,
      sanctions,
    });
    return getSectionsPdfBlob(doc.sections, doc.title, pdfOptions());
  }

  async function exportDossier() {
    if (!picked || !dossier) throw new Error("Aucun dossier");
    const klass = picked.class_name || "—";
    const title = `${pickedName} — ${dossierTitle}`;
    let sections: PdfSection[];
    if (dossier === "presences") {
      sections = [
        {
          lines: [
            klass,
            `${formatShortDate(attFrom)} — ${formatShortDate(attTo)}`,
            attStatus ? statusLabel(attStatus) : "Tous",
          ],
        },
        pdfRows("Présences", [
          { header: "Date", key: "date" },
          { header: "Appel", key: "appel" },
          { header: "Classe", key: "classe" },
        ], visibleAttendance.map((row) => ({
          date: formatShortDate(row.date),
          appel: statusLabel(row.status),
          classe: row.class_name || "—",
        }))),
      ];
    } else if (dossier === "moyennes") {
      sections = [
        { lines: [klass] },
        pdfRows("Moyennes", [
          { header: "Période", key: "periode" },
          { header: "Moyenne", key: "moyenne" },
        ], periodAverages.map((row) => ({
          periode: row.period_name,
          moyenne: formatAverage(row.average),
        }))),
      ];
    } else if (dossier === "economat") {
      sections = [
        { lines: [klass, `À verser : ${formatNumber(owedNow)}`] },
        pdfRows("Économat", [
          { header: "Service", key: "service" },
          { header: "Échéance", key: "echeance" },
          { header: "Dû", key: "du" },
          { header: "Payé", key: "paye" },
          { header: "Solde", key: "solde" },
        ], dueFees.filter((row) => row.balance > 0.01).map((row) => ({
          service: row.service_name,
          echeance: row.due_date ? formatShortDate(row.due_date) : "—",
          du: formatNumber(row.amount_due),
          paye: formatNumber(row.total_paid),
          solde: formatNumber(row.balance),
        }))),
      ];
    } else {
      sections = [
        { lines: [klass, pickedSanction] },
        pdfRows("Sanctions", [
          { header: "Date", key: "date" },
          { header: "Mesure", key: "mesure" },
          { header: "Motif", key: "motif" },
          { header: "État", key: "etat" },
        ], sanctionHistory.map((row) => ({
          date: formatShortDate(row.created_at),
          mesure: row.label || "—",
          motif: row.reason || "—",
          etat: row.active ? "En cours" : "Terminée",
        }))),
      ];
    }
    return getSectionsPdfBlob(sections, title, pdfOptions());
  }

  const boards = data ? presenceCards(data.rolls) : [];
  const cycles = presenceCycles(boards);
  const room = roomPick;

  async function exportRoom() {
    const name = room?.room_name || room?.class_name || "Salle";
    return getSectionsPdfBlob(
      [
        {
          lines: [
            room?.room_name ? room.class_name : name,
            `${formatShortDate(roomFrom)} — ${formatShortDate(roomTo)}`,
          ],
        },
        pdfRows("Présences", [
          { header: "Date", key: "date" },
          { header: "Présents", key: "presents" },
          { header: "Retards", key: "retards" },
          { header: "Absents", key: "absents" },
          { header: "Excusés", key: "excuses" },
          { header: "Non appelés", key: "non" },
          { header: "Noms absents", key: "noms" },
        ], roomDays.map((row) => ({
          date: formatShortDate(row.date),
          presents: String(row.present),
          retards: String(row.late),
          absents: String(row.absent),
          excuses: String(row.excused),
          non: String(row.missing),
          noms: row.absents.join(", ") || "—",
        }))),
      ],
      `${name} — Présences`,
      pdfOptions(),
    );
  }

  return (
    <div className="monitor">
      {section === "jour" ? (
        <header className="monitor-welcome">
          {getImageUrl(school?.logo_url ?? undefined) ? (
            <img src={getImageUrl(school?.logo_url ?? undefined)!} alt="" />
          ) : (
            <div className="monitor-welcome-mark">{school?.name?.charAt(0) ?? "É"}</div>
          )}
          <p className="monitor-welcome-name">{school?.name ?? "École"}</p>
          {school?.slogan ? <p className="monitor-welcome-slogan">{school.slogan}</p> : null}
          <p className="monitor-welcome-meta">
            {[
              data ? formatLongDate(data.today) : null,
              data?.context.yearName,
              data?.context.periodName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="monitor-hero-tools">
            <div className="monitor-search">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Élève"
              />
              {hits.length > 0 && (
                <ul className="monitor-hits">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button type="button" onClick={() => openStudent(hit)} className="monitor-hit">
                        <span>{studentLabel(hit.first_name, hit.last_name)}</span>
                        <span>{hit.class_name || "—"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="monitor-actions">
              <button type="button" onClick={() => setReloadKey((n) => n + 1)} className="monitor-btn">
                Actualiser
              </button>
              <ExportPdfButton
                label="PDF"
                className="monitor-btn"
                filename={pdf?.filename ?? "monitoring"}
                mainTitle={pdf?.title}
                sections={pdf?.sections}
                disabled={!pdf || loading || !detailsReady}
              />
            </div>
          </div>
        </header>
      ) : (
        <div className="monitor-section-bar">
          <button type="button" className="monitor-back" onClick={() => setSection("jour")}>
            Accueil
          </button>
          <h2 className="monitor-section-title">
            {sections.find((item) => item.id === section)?.label}
          </h2>
          <div className="monitor-actions">
            <button type="button" onClick={() => setReloadKey((n) => n + 1)} className="monitor-btn">
              Actualiser
            </button>
            <ExportPdfButton
              label="PDF"
              className="monitor-btn"
              filename={pdf?.filename ?? "monitoring"}
              mainTitle={pdf?.title}
              sections={pdf?.sections}
              disabled={!pdf || loading || !detailsReady}
            />
          </div>
        </div>
      )}

      {section !== "jour" && (
      <div className="monitor-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Élève"
        />
        {hits.length > 0 && (
          <ul className="monitor-hits">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" onClick={() => openStudent(hit)} className="monitor-hit">
                  <span>{studentLabel(hit.first_name, hit.last_name)}</span>
                  <span>{hit.class_name || "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {picked && (
        <div className="monitor-student">
          <div className="monitor-student-head">
            <div>
              <p className="monitor-student-name">{pickedName}</p>
              <p className="monitor-student-class">{picked.class_name || "—"}</p>
            </div>
            <div className="monitor-student-actions">
              <Link
                to={`/dashboard/fiche-eleve?student_id=${encodeURIComponent(picked.id)}`}
                className="monitor-link"
              >
                Fiche
              </Link>
              <ExportPdfButton
                label="PDF"
                className="monitor-btn"
                filename={`eleve-${pickedName.replace(/\s+/g, "-")}-${data?.today ?? ""}`}
                mainTitle={pickedName}
                getBlob={exportStudent}
              />
              <button type="button" onClick={() => setPicked(null)} className="monitor-btn">
                Fermer
              </button>
            </div>
          </div>
          <div className={showMoney ? "monitor-kpis" : "monitor-kpis cols-3"}>
            <StatButton
              value={pickedStatus}
              label="Aujourd'hui"
              tone={statusTone(pickedStatus)}
              onClick={() => setDossier("presences")}
            />
            <StatButton
              value={avgLoading ? "…" : formatAverage(cardAverage)}
              label="Moyenne"
              onClick={() => setDossier("moyennes")}
            />
            {showMoney && (
              <StatButton
                value={avgLoading || feeLoading ? "…" : formatNumber(owedNow)}
                label="À verser"
                tone={!avgLoading && !feeLoading && owedNow > 0 ? "alert" : "good"}
                onClick={() => setDossier("economat")}
              />
            )}
            <StatButton
              value={detailsReady ? pickedSanction : "…"}
              label="Sanction"
              tone={detailsReady && pickedSanction !== "Aucune" ? "alert" : "ink"}
              onClick={() => setDossier("sanctions")}
            />
          </div>
        </div>
      )}

      {dossier && picked && (
        <div className="monitor-modal-back" onClick={() => setDossier(null)}>
          <div
            className="monitor-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="monitor-student-head">
              <div>
                <h2 className="monitor-title">{dossierTitle}</h2>
                <p className="monitor-student-class">{pickedName}</p>
              </div>
              <div className="monitor-student-actions">
                <ExportPdfButton
                  label="PDF"
                  className="monitor-btn"
                  filename={`${dossier}-${pickedName.replace(/\s+/g, "-")}-${data?.today ?? ""}`}
                  mainTitle={`${pickedName} — ${dossierTitle}`}
                  getBlob={exportDossier}
                  disabled={dossierBusy}
                />
                <button type="button" className="monitor-btn" onClick={() => setDossier(null)}>
                  Fermer
                </button>
              </div>
            </div>
            {dossier === "presences" && (
              <>
                <div className="monitor-filters">
                  <label className="monitor-field">
                    Du
                    <input type="date" value={attFrom} onChange={(e) => setAttFrom(e.target.value)} />
                  </label>
                  <label className="monitor-field">
                    Au
                    <input type="date" value={attTo} onChange={(e) => setAttTo(e.target.value)} />
                  </label>
                  <label className="monitor-field">
                    Appel
                    <select value={attStatus} onChange={(e) => setAttStatus(e.target.value)}>
                      <option value="">Tous</option>
                      <option value="PRESENT">Présent</option>
                      <option value="ABSENT">Absent</option>
                      <option value="LATE">Retard</option>
                      <option value="EXCUSED">Excusé</option>
                    </select>
                  </label>
                </div>
                {attLoading ? (
                  <p className="monitor-note">Chargement...</p>
                ) : (
                  <div className="monitor-scroll">
                    <DataTable
                      headers={["Date", "Appel", "Classe"]}
                      empty="Aucune présence"
                      rows={visibleAttendance.map((row) => [
                        formatShortDate(row.date),
                        <StatusText key={row.id} status={statusLabel(row.status)} />,
                        row.class_name || "—",
                      ])}
                    />
                  </div>
                )}
              </>
            )}
            {dossier === "moyennes" &&
              (avgLoading ? (
                <p className="monitor-note">Chargement...</p>
              ) : (
                <DataTable
                  headers={["Période", "Moyenne"]}
                  empty="Aucune moyenne"
                  rows={periodAverages.map((row) => [row.period_name, formatAverage(row.average)])}
                />
              ))}
            {dossier === "economat" &&
              (avgLoading || feeLoading ? (
                <p className="monitor-note">Chargement...</p>
              ) : (
                <>
                  <div className="monitor-kpis cols-3">
                    <Stat value={formatNumber(owedNow)} label="À verser" tone={owedNow > 0 ? "alert" : "good"} />
                  </div>
                  <DataTable
                    headers={["Service", "Échéance", "Dû", "Payé", "Solde"]}
                    empty="Aucun solde"
                    rows={dueFees
                      .filter((row) => row.balance > 0.01)
                      .map((row) => [
                        row.service_name,
                        row.due_date ? formatShortDate(row.due_date) : "—",
                        formatNumber(row.amount_due),
                        formatNumber(row.total_paid),
                        formatNumber(row.balance),
                      ])}
                  />
                </>
              ))}
            {dossier === "sanctions" &&
              (sanctionLoading ? (
                <p className="monitor-note">Chargement...</p>
              ) : (
                <DataTable
                  headers={["Date", "Mesure", "Motif", "État"]}
                  empty="Aucune sanction"
                  rows={sanctionHistory.map((row) => [
                    formatShortDate(row.created_at),
                    row.label || "—",
                    row.reason || "—",
                    row.active ? "En cours" : "Terminée",
                  ])}
                />
              ))}
          </div>
        </div>
      )}

      {loading && <p className="monitor-note">Chargement...</p>}
      {!loading && !data && <p className="monitor-empty">Indisponible</p>}

      {data && totals && section === "jour" && (
        <>
          <div className="monitor-board">
          <button type="button" className="monitor-presence" onClick={() => setSection("presences")}>
            <p className="monitor-presence-label">Présences</p>
            <div className="monitor-presence-stats">
              <p className="monitor-presence-stat good">
                <b>{formatNumber(totals.presents)}</b>
                <span>Présents</span>
              </p>
              <p className="monitor-presence-stat alert">
                <b>{formatNumber(totals.absents)}</b>
                <span>Absents</span>
              </p>
              <p className="monitor-presence-stat wait">
                <b>{formatNumber(totals.lates)}</b>
                <span>Retards</span>
              </p>
              <p className="monitor-presence-stat">
                <b>{formatNumber(totals.missing)}</b>
                <span>Non appelés</span>
              </p>
            </div>
          </button>
          <div className={showMoney ? "monitor-metrics" : "monitor-metrics cols-3"}>
            {showMoney && (
              <button type="button" className="monitor-metric" onClick={() => setSection("argent")}>
                <span className="monitor-metric-label">Finance</span>
                <span className="monitor-metric-value">{detailsReady ? formatNumber(data.collectedToday) : "…"}</span>
                <span className="monitor-metric-hint">Encaissé</span>
              </button>
            )}
            <button type="button" className="monitor-metric" onClick={() => setSection("discipline")}>
              <span className="monitor-metric-label">Discipline</span>
              <span className="monitor-metric-value">{detailsReady ? formatNumber(data.measures.length) : "…"}</span>
              <span className="monitor-metric-hint">Sanctions</span>
            </button>
            <button type="button" className="monitor-metric" onClick={() => setSection("moyennes")}>
              <span className="monitor-metric-label">Moyennes</span>
              <span className="monitor-metric-value">{detailsReady ? formatAverage(data.schoolAverage) : "…"}</span>
              <span className="monitor-metric-hint">École</span>
            </button>
            <button type="button" className="monitor-metric" onClick={() => setSection("travaux")}>
              <span className="monitor-metric-label">Leçons et devoirs</span>
              <span className="monitor-metric-value">{detailsReady ? formatNumber(data.works.length) : "…"}</span>
              <span className="monitor-metric-hint">Aujourd'hui</span>
            </button>
          </div>
          </div>
          <div className="monitor-home">
            <section className="monitor-panel">
              <div className="monitor-panel-head">
                <h2 className="monitor-title">Absents</h2>
                <button type="button" className="monitor-jump" onClick={() => setSection("presences")}>
                  Présences
                </button>
              </div>
              {absents.length === 0 ? (
                <p className="monitor-empty">Aucun absent</p>
              ) : (
                absents.slice(0, 8).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="monitor-person"
                    onClick={() => openByName(data, row.id, openStudent)}
                  >
                    <span>{row.name}</span>
                    <span>{row.class_name}</span>
                  </button>
                ))
              )}
            </section>
            <section className="monitor-panel monitor-journal">
              <div className="monitor-journal-block">
                <div className="monitor-panel-head">
                  <h2 className="monitor-title">Sanctions</h2>
                  <button type="button" className="monitor-jump" onClick={() => setSection("discipline")}>
                    Discipline
                  </button>
                </div>
                {!detailsReady ? (
                  <p className="monitor-note">Chargement...</p>
                ) : data.measures.length === 0 ? (
                  <p className="monitor-empty">Aucune sanction</p>
                ) : (
                  data.measures.slice(0, 4).map((row) => (
                    <div key={row.id} className="monitor-line">
                      <span>{row.student_name || "—"}</span>
                      <span>{row.label || "—"}</span>
                    </div>
                  ))
                )}
              </div>
              {showMoney && (
                <div className="monitor-journal-block">
                  <div className="monitor-panel-head">
                    <h2 className="monitor-title">Paiements</h2>
                    <button type="button" className="monitor-jump" onClick={() => setSection("argent")}>
                      Finance
                    </button>
                  </div>
                  {!detailsReady ? (
                    <p className="monitor-note">Chargement...</p>
                  ) : data.paymentsToday.length === 0 ? (
                    <p className="monitor-empty">Aucun paiement</p>
                  ) : (
                    data.paymentsToday.slice(0, 4).map((row) => (
                      <div key={row.id} className="monitor-line">
                        <span>{row.student_name || "—"}</span>
                        <span>{formatNumber(row.amount_paid)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
              <div className="monitor-journal-block">
                <div className="monitor-panel-head">
                  <h2 className="monitor-title">Leçons et devoirs</h2>
                  <button type="button" className="monitor-jump" onClick={() => setSection("travaux")}>
                    Liste
                  </button>
                </div>
                {!detailsReady ? (
                  <p className="monitor-note">Chargement...</p>
                ) : data.works.length === 0 ? (
                  <p className="monitor-empty">Aucun travail</p>
                ) : (
                  data.works.slice(0, 4).map((row) => (
                    <div key={row.id} className="monitor-line">
                      <span>{row.title}</span>
                      <span>{row.class_name || kindLabel(row.kind)}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {data && section === "presences" && (
        boards.length === 0 ? (
          <p className="monitor-empty">Aucune salle</p>
        ) : (
          <div className="monitor-cycles">
            {cycles.map((cycle) => (
              <section key={cycle.key} className="monitor-cycle">
                <h3 className="monitor-cycle-title">{cycle.label}</h3>
                <div className="monitor-rooms">
            {cycle.cards.map((item) => (
              <button
                key={item.key}
                type="button"
                className="monitor-room"
                onClick={() => setRoomPick(item)}
              >
                <div className="monitor-room-top">
                  <div>
                    {item.room_name ? <p className="monitor-room-kicker">{item.class_name}</p> : null}
                    <p className="monitor-room-name">{item.room_name || item.class_name}</p>
                  </div>
                  <span className="monitor-room-count">
                    <b>{item.failed ? "—" : item.students.length}</b>
                    <span>Élèves</span>
                  </span>
                </div>
                {item.failed ? (
                  <p className="monitor-room-miss">Indisponible</p>
                ) : (
                  <div className="monitor-room-stats">
                    <p className="monitor-room-stat good">
                      <b>{countStatus(item.students, "PRESENT")}</b>
                      <span>Présents</span>
                    </p>
                    <p className="monitor-room-stat alert">
                      <b>{countStatus(item.students, "ABSENT")}</b>
                      <span>Absents</span>
                    </p>
                    <p className="monitor-room-stat wait">
                      <b>{countStatus(item.students, "LATE")}</b>
                      <span>Retards</span>
                    </p>
                    <p className="monitor-room-stat miss">
                      <b>{countStatus(item.students, null)}</b>
                      <span>Non appelés</span>
                    </p>
                  </div>
                )}
              </button>
            ))}
                </div>
              </section>
            ))}
          </div>
        )
      )}

      {roomPick && (
        <div className="monitor-modal-back" onClick={() => setRoomPick(null)}>
          <div
            className="monitor-modal wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="monitor-student-head">
              <div>
                <h2 className="monitor-title">{room?.room_name || room?.class_name || "Salle"}</h2>
                {room?.room_name ? <p className="monitor-student-class">{room.class_name}</p> : null}
              </div>
              <div className="monitor-student-actions">
                <ExportPdfButton
                  label="PDF"
                  className="monitor-btn"
                  filename={`presences-${(room?.room_name || room?.class_name || "salle").replace(/\s+/g, "-")}-${roomFrom}-${roomTo}`}
                  mainTitle={`${room?.room_name || room?.class_name || "Salle"} — Présences`}
                  getBlob={exportRoom}
                  disabled={roomLoading}
                />
                <button type="button" className="monitor-btn" onClick={() => setRoomPick(null)}>
                  Fermer
                </button>
              </div>
            </div>
            <div className="monitor-filters">
              <label className="monitor-field">
                Du
                <input type="date" value={roomFrom} onChange={(e) => setRoomFrom(e.target.value)} />
              </label>
              <label className="monitor-field">
                Au
                <input type="date" value={roomTo} onChange={(e) => setRoomTo(e.target.value)} />
              </label>
            </div>
            {roomLoading ? (
              <p className="monitor-note">Chargement...</p>
            ) : (
              <div className="monitor-scroll">
                <DataTable
                  headers={["Date", "Présents", "Retards", "Absents", "Excusés", "Non appelés", "Noms absents"]}
                  empty="Aucune présence"
                  rows={roomDays.map((row) => [
                    formatShortDate(row.date),
                    String(row.present),
                    String(row.late),
                    String(row.absent),
                    String(row.excused),
                    String(row.missing),
                    row.absents.join(", ") || "—",
                  ])}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {data && section === "argent" && showMoney && !detailsReady && (
        <p className="monitor-note">Chargement...</p>
      )}

      {data && section === "argent" && showMoney && detailsReady && (
        <div className="monitor-block">
          <div className="monitor-kpis">
            <Stat value={formatNumber(data.collectedToday)} label="Encaissé" tone="good" />
            <Stat value={formatPercent(data.collectionRate)} label="Recouvrement" />
            <Stat value={formatNumber(data.studentsWithBalance)} label="Débiteurs" tone="wait" />
            <Stat value={formatNumber(data.balance)} label="Reste à recouvrer" tone="alert" />
          </div>
          <h2 className="monitor-title">Paiements du jour</h2>
          <DataTable
            headers={["Élève", "Classe", "Service", "Montant"]}
            empty="Aucun paiement"
            rows={data.paymentsToday.map((row) => [
              row.student_id ? (
                <NameButton
                  key={row.id}
                  onClick={() =>
                    openStudent({
                      id: row.student_id!,
                      first_name: "",
                      last_name: row.student_name || "—",
                      class_id: null,
                      class_name: row.class_name,
                      order_number: null,
                    })
                  }
                >
                  {row.student_name || "—"}
                </NameButton>
              ) : (
                row.student_name || "—"
              ),
              row.class_name || "—",
              row.service_name || "—",
              formatNumber(row.amount_paid),
            ])}
          />
          <h2 className="monitor-title">Soldes</h2>
          <DataTable
            headers={["Élève", "Classe", "Solde"]}
            empty="Aucun solde"
            rows={data.debtors.map((row) => [
              <NameButton
                key={row.student_id}
                onClick={() =>
                  openStudent({
                    id: row.student_id,
                    first_name: "",
                    last_name: row.student_name,
                    class_id: null,
                    class_name: row.class_name,
                    order_number: null,
                  })
                }
              >
                {row.student_name}
              </NameButton>,
              row.class_name || "—",
              formatNumber(row.balance),
            ])}
          />
        </div>
      )}

      {data && section === "discipline" && !detailsReady && (
        <p className="monitor-note">Chargement...</p>
      )}

      {data && section === "discipline" && detailsReady && (
        <div className="monitor-block">
          <div className="monitor-kpis cols-3">
            <Stat value={formatNumber(data.measures.length)} label="Sanctions" tone="alert" />
            <Stat value={formatNumber(data.latenesses.length)} label="Retards" tone="wait" />
            <Stat value={formatNumber(totals?.absents)} label="Absents" tone="alert" />
          </div>
          <h2 className="monitor-title">Sanctions</h2>
          <DataTable
            headers={["Élève", "Mesure", "Motif"]}
            empty="Aucune sanction"
            rows={data.measures.map((row) => [
              row.student_id ? (
                <NameButton
                  key={row.id}
                  onClick={() =>
                    openStudent({
                      id: row.student_id!,
                      first_name: "",
                      last_name: row.student_name || "—",
                      class_id: null,
                      class_name: null,
                      order_number: null,
                    })
                  }
                >
                  {row.student_name || "—"}
                </NameButton>
              ) : (
                row.student_name || "—"
              ),
              row.label || "—",
              row.reason || "—",
            ])}
          />
          <h2 className="monitor-title">Retards</h2>
          <DataTable
            headers={["Élève", "Classe", "Arrivée"]}
            empty="Aucun retard"
            rows={data.latenesses.map((row) => [
              row.student_name || "—",
              row.class_name || "—",
              formatClock(row.arrival_time),
            ])}
          />
        </div>
      )}

      {data && section === "moyennes" && !detailsReady && (
        <p className="monitor-note">Chargement...</p>
      )}

      {data && section === "moyennes" && detailsReady && (
        <Moyennes
          data={data}
          onStudent={(row) =>
            openStudent({
              id: row.id,
              first_name: "",
              last_name: row.name,
              class_id: row.class_id,
              class_name: row.class_name,
              order_number: null,
            })
          }
        />
      )}

      {data && section === "travaux" && !detailsReady && (
        <p className="monitor-note">Chargement...</p>
      )}

      {data && section === "travaux" && detailsReady && (
        <DataTable
          headers={["Type", "Titre", "Classe", "Matière", "Professeur"]}
          empty="Aucun travail"
          rows={data.works.map((row) => [
            kindLabel(row.kind),
            row.title,
            row.class_name || "—",
            row.subject_name || "—",
            row.teacher_name || "—",
          ])}
        />
      )}

    </div>
  );
}

function Moyennes({
  data,
  onStudent,
}: {
  data: MonitorSnapshot;
  onStudent: (row: AcademicStudent) => void;
}) {
  const ranked = [...data.averages.values()].sort((a, b) => b.average - a.average);
  const above = data.threshold == null ? ranked.slice(0, 15) : ranked.filter((s) => s.average >= data.threshold!);
  const below = data.threshold == null ? [] : ranked.filter((s) => s.average < data.threshold!).reverse();
  return (
    <div className="monitor-block">
      <div className="monitor-kpis">
        <Stat value={formatAverage(data.schoolAverage)} label="Moyenne" tone="good" />
        <Stat value={formatPercent(data.successRate)} label="Au-dessus du seuil" tone="good" />
        <Stat value={formatNumber(data.gradedStudents)} label="Élèves notés" />
        <Stat value={formatAverage(data.threshold)} label="Seuil" />
      </div>
      <h2 className="monitor-title">Classes</h2>
      <DataTable
        headers={["Classe", "Notés", "Moyenne", "Réussite"]}
        empty="Aucune classe"
        rows={data.byClass.map((row) => [
          row.class_name,
          String(row.graded_students),
          formatAverage(row.average),
          formatPercent(row.success_rate),
        ])}
      />
      <h2 className="monitor-title">Professeurs</h2>
      <DataTable
        headers={["Professeur", "Notés", "Moyenne", "Réussite"]}
        empty="Aucun professeur"
        rows={data.byTeacher.map((row) => [
          row.teacher_name,
          String(row.graded_students),
          formatAverage(row.average),
          formatPercent(row.success_rate),
        ])}
      />
      <div className="monitor-split">
        <div className="monitor-block">
          <h2 className="monitor-title">Au-dessus</h2>
          <DataTable
            headers={["Élève", "Classe", "Moyenne"]}
            empty="Aucun"
            rows={above.slice(0, 15).map((row) => [
              <NameButton key={row.id} onClick={() => onStudent(row)}>
                {row.name}
              </NameButton>,
              row.class_name || "—",
              formatAverage(row.average),
            ])}
          />
        </div>
        <div className="monitor-block">
          <h2 className="monitor-title">En dessous</h2>
          <DataTable
            headers={["Élève", "Classe", "Moyenne"]}
            empty="Aucun"
            rows={below.slice(0, 15).map((row) => [
              <NameButton key={row.id} onClick={() => onStudent(row)}>
                {row.name}
              </NameButton>,
              row.class_name || "—",
              formatAverage(row.average),
            ])}
          />
        </div>
      </div>
    </div>
  );
}

function withClass(data: MonitorSnapshot, hit: SearchHit): SearchHit {
  for (const roll of data.rolls) {
    const student = roll.students.find((item) => item.id === hit.id);
    if (!student) continue;
    return {
      id: student.id,
      first_name: student.first_name || hit.first_name,
      last_name: student.last_name || hit.last_name,
      class_id: roll.class_id,
      class_name: roll.class_name,
      order_number: hit.order_number,
    };
  }
  return hit;
}

function statusFor(data: MonitorSnapshot, studentId: string): string {
  for (const roll of data.rolls) {
    const student = roll.students.find((item) => item.id === studentId);
    if (student) return statusLabel(student.status);
  }
  return "—";
}

function measureFor(data: MonitorSnapshot, studentId: string): string {
  const row = data.measures.find((item) => item.student_id === studentId);
  if (!row) return "Aucune";
  return [row.label, row.reason].filter(Boolean).join(" — ") || "—";
}

function measureLabel(data: MonitorSnapshot, studentId: string): string {
  return data.measures.find((item) => item.student_id === studentId)?.label || "Aucune";
}

function statusTone(status: string): "ink" | "good" | "alert" | "wait" {
  if (status === "Présent" || status === "Excusé") return "good";
  if (status === "Absent") return "alert";
  if (status === "Retard" || status === "Non appelé") return "wait";
  return "ink";
}

function pdfRows(
  title: string,
  columns: { header: string; key: string }[],
  rows: Record<string, string>[],
): PdfSection {
  if (!rows.length) return { title, lines: ["Aucun"] };
  return { title, table: { columns, rows } };
}

function headlineAverage(rows: PeriodAverage[], periodName: string | null): number | null {
  if (periodName) {
    const match = rows.find((row) => row.period_name === periodName);
    if (match) return match.average;
  }
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].average != null) return rows[i].average;
  }
  return null;
}

function openByName(
  data: MonitorSnapshot,
  studentId: string,
  open: (hit: SearchHit) => void,
) {
  for (const roll of data.rolls) {
    const student = roll.students.find((item) => item.id === studentId);
    if (!student) continue;
    open({
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      class_id: roll.class_id,
      class_name: roll.class_name,
      order_number: null,
    });
    return;
  }
}
