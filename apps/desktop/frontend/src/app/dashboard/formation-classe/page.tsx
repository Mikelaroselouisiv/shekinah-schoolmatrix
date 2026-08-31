"use client";

import { useState, useEffect, useMemo } from "react";
import { API_BASE, fetchWithAuth } from "@/src/lib/api";
import { useSchoolProfile } from "@/src/contexts/SchoolProfileContext";
import { ExportPdfButton } from "@/src/components/ExportPdfButton";
import { ExportBadgePdfButton } from "@/src/components/ExportBadgePdfButton";
import { buildBadgesPdfBlob, fetchStudentsForRoomBadges } from "@/src/lib/badgeProduction";
import { EDUCATION_LEVELS, educationLevelLabel } from "@/src/lib/educationLevels";

type AcademicYear = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
};

type ClassItem = {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  section: string | null;
  is_preschool?: boolean;
};

type RoomItem = {
  id: string;
  name: string;
  class_id: string | null;
  student_count: number;
  capacity: number | null;
  active: boolean;
};

const DECISION_OPTIONS = [
  { value: "ADMIS", label: "Admis" },
  { value: "ADMIS_AILLEURS", label: "Admis ailleurs" },
  { value: "REDOUBLER", label: "Redoubler" },
  { value: "AJOURNE", label: "Ajourné" },
  { value: "RENVOYE_DEFINITIVEMENT", label: "Renvoyé définitivement" },
] as const;

type StudentInClass = {
  id: string;
  first_name: string;
  last_name: string;
  order_number?: string | null;
  management_code?: string | null;
  student_code?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  decision: string | null;
  average: number | null;
  assignment_id: string | null;
};

const UNASSIGNED_ROOM_ID = "__sans_salle__";

function schoolCode(s: StudentInClass): string {
  return (s.management_code || s.student_code || "").trim() || "—";
}

function decisionLabel(value: string | null): string {
  if (!value) return "—";
  return DECISION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function decisionBadgeClass(decision: string): string {
  if (decision === "ADMIS") return "bg-green-100 text-green-800";
  if (decision === "ADMIS_AILLEURS") return "bg-emerald-100 text-emerald-800";
  if (decision === "REDOUBLER") return "bg-amber-100 text-amber-800";
  if (decision === "AJOURNE") return "bg-orange-100 text-orange-800";
  if (decision === "RENVOYE_DEFINITIVEMENT" || decision === "RENVOYE" || decision === "EXPELLED") {
    return "bg-red-100 text-red-800";
  }
  return "bg-slate-100 text-slate-600";
}

function nextYearPreview(name: string): string {
  const range = name.match(/(\d{4})\s*[-–/]\s*(\d{4})/);
  if (range) {
    return name.replace(
      range[0],
      `${Number.parseInt(range[1], 10) + 1}-${Number.parseInt(range[2], 10) + 1}`,
    );
  }
  const year = name.match(/(\d{4})/);
  if (year) {
    return name.replace(year[1], String(Number.parseInt(year[1], 10) + 1));
  }
  return `${name.trim()} (suivant)`;
}

function pdfRows(list: StudentInClass[]) {
  return list.map((s) => ({
    school_code: schoolCode(s),
    last_name: s.last_name,
    first_name: s.first_name,
    room_name: s.room_name || "Sans salle",
    average: s.average != null ? s.average.toFixed(2) : "—",
    decision_label: decisionLabel(s.decision),
  }));
}

export default function FormationClassePage() {
  const { school, refetch: refetchSchool } = useSchoolProfile();
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [classStudents, setClassStudents] = useState<StudentInClass[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [openClass, setOpenClass] = useState<ClassItem | null>(null);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingDecisionId, setSavingDecisionId] = useState<string | null>(null);
  const [computingDecisions, setComputingDecisions] = useState(false);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [launchAck, setLaunchAck] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<string>("");

  const selectedYear = academicYears.find((y) => y.id === selectedYearId);
  const isPreschoolClass = openClass?.is_preschool ?? false;

  const roomsByClass = useMemo(() => {
    const map = new Map<string, RoomItem[]>();
    for (const r of rooms) {
      if (!r.class_id || r.active === false) continue;
      const list = map.get(r.class_id) ?? [];
      list.push(r);
      map.set(r.class_id, list);
    }
    return map;
  }, [rooms]);

  const classGroups = useMemo(() => {
    const known = new Set(EDUCATION_LEVELS.map((l) => l.key as string));
    const groups = EDUCATION_LEVELS.map((level) => ({
      key: level.key,
      label: level.label,
      classes: classes.filter((c) => c.level === level.key),
    })).filter((g) => g.classes.length > 0);
    const other = classes.filter((c) => !c.level || !known.has(c.level));
    if (other.length) {
      groups.push({ key: "AUTRE", label: "Autres classes", classes: other });
    }
    return groups;
  }, [classes]);

  const openClassRooms = openClass ? roomsByClass.get(openClass.id) ?? [] : [];
  const unassignedStudents = classStudents.filter((s) => !s.room_id);
  const openRoomStudents =
    openRoomId === UNASSIGNED_ROOM_ID
      ? unassignedStudents
      : classStudents.filter((s) => s.room_id === openRoomId);
  const openRoomName =
    openRoomId === UNASSIGNED_ROOM_ID
      ? "Sans salle"
      : openClassRooms.find((r) => r.id === openRoomId)?.name ?? "Salle";

  async function loadAcademicYears() {
    setError("");
    try {
      const [res, ctxRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/academic-years`),
        fetchWithAuth(`${API_BASE}/school/current-context`),
      ]);
      const data = await res.json();
      const ctxData = await ctxRes.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const years = data.academic_years ?? [];
      setAcademicYears(years);
      if (years.length > 0) {
        const defaultId =
          ctxRes.ok &&
          ctxData.current_academic_year_id &&
          years.some((y: AcademicYear) => y.id === ctxData.current_academic_year_id)
            ? ctxData.current_academic_year_id
            : years[0].id;
        setSelectedYearId((prev) => (prev === "" ? defaultId : prev));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }

  async function loadClassesAndRooms() {
    setError("");
    try {
      const [classesRes, roomsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/classes`),
        fetchWithAuth(`${API_BASE}/rooms`),
      ]);
      const classesData = await classesRes.json();
      const roomsData = await roomsRes.json();
      if (!classesRes.ok) throw new Error(classesData.message || "Erreur");
      if (!roomsRes.ok) throw new Error(roomsData.message || "Erreur");
      setClasses(classesData.classes ?? []);
      setRooms(roomsData.rooms ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }

  async function loadClassStudents(classId: string, yearId: string) {
    if (!classId || !yearId) {
      setClassStudents([]);
      return;
    }
    setStudentsLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/formation-classe/students?academic_year_id=${yearId}&class_id=${classId}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setClassStudents(data.students ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setClassStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    await Promise.all([loadAcademicYears(), loadClassesAndRooms()]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function openClassModal(cls: ClassItem) {
    setOpenClass(cls);
    setOpenRoomId(null);
    if (selectedYearId) await loadClassStudents(cls.id, selectedYearId);
  }

  async function handleComputeDecisions() {
    if (!selectedYearId || !openClass || isPreschoolClass) return;
    setComputingDecisions(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/formation-classe/compute-decisions`, {
        method: "POST",
        body: JSON.stringify({ academic_year_id: selectedYearId, class_id: openClass.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      await loadClassStudents(openClass.id, selectedYearId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setComputingDecisions(false);
    }
  }

  async function handleSetDecision(assignmentId: string | null, decision: string) {
    if (!assignmentId || !openClass) return;
    setSavingDecisionId(assignmentId);
    setError("");
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/formation-classe/assignments/${assignmentId}/decision`,
        {
          method: "PATCH",
          body: JSON.stringify({ decision }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      await loadClassStudents(openClass.id, selectedYearId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingDecisionId(null);
    }
  }

  async function handleLaunchNextYear() {
    if (!selectedYearId || !launchAck) return;
    setLaunching(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_BASE}/formation-classe/launch-next-year`, {
        method: "POST",
        body: JSON.stringify({ current_year_id: selectedYearId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      const next = data.next_year as { id: string; name: string } | undefined;
      setLaunchResult(
        `Année ${next?.name ?? "suivante"} lancée : ${data.created ?? 0} inscriptions, ${data.promoted ?? 0} promotions, ${data.skipped ?? 0} exclus non inscrits, ${data.periods_copied ?? 0} périodes et ${data.slots_copied ?? 0} créneaux copiés.`,
      );
      setShowLaunchConfirm(false);
      setLaunchAck(false);
      setOpenClass(null);
      setOpenRoomId(null);
      await Promise.all([loadAcademicYears(), loadClassesAndRooms(), refetchSchool()]);
      if (next?.id) setSelectedYearId(next.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLaunching(false);
    }
  }

  function studentTable(list: StudentInClass[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-[var(--app-border)]">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-900">Code école</th>
              <th className="px-4 py-3 font-medium text-slate-900">Nom</th>
              <th className="px-4 py-3 font-medium text-slate-900">Prénom</th>
              <th className="px-4 py-3 font-medium text-slate-900">Salle</th>
              <th className="px-4 py-3 font-medium text-slate-900">Moyenne</th>
              <th className="px-4 py-3 font-medium text-slate-900">Décision</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Aucun élève dans cette liste.
                </td>
              </tr>
            ) : (
              list.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--app-border)] last:border-b-0 hover:bg-slate-50/50"
                >
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                    {schoolCode(s)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.last_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.first_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.room_name || "Sans salle"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.average != null ? s.average.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isPreschoolClass ? (
                      <select
                        value={s.decision ?? ""}
                        onChange={(e) => handleSetDecision(s.assignment_id, e.target.value)}
                        disabled={!s.assignment_id || savingDecisionId === s.assignment_id}
                        className="border border-[var(--app-border)] rounded px-2 py-1.5 text-sm min-w-[160px]"
                      >
                        <option value="">— Choisir —</option>
                        {DECISION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : s.decision ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${decisionBadgeClass(s.decision)}`}
                      >
                        {decisionLabel(s.decision)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) {
    return <div className="animate-pulse text-slate-500">Chargement...</div>;
  }

  const pdfColumnsBase = [
    { header: "Code école", key: "school_code" },
    { header: "Nom", key: "last_name" },
    { header: "Prénom", key: "first_name" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Formation de classe</h2>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
      )}
      {launchResult && (
        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">{launchResult}</div>
      )}

      <div className="flex flex-wrap items-end gap-4 p-5 rounded-xl border border-[var(--app-border)] bg-white">
        <div className="min-w-[220px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Année académique
          </label>
          <select
            value={selectedYearId}
            onChange={(e) => {
              setSelectedYearId(e.target.value);
              setOpenClass(null);
              setOpenRoomId(null);
              setLaunchResult("");
            }}
            className="w-full border border-[var(--app-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--school-accent-1)]/40"
          >
            <option value="">— Sélectionner —</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!selectedYearId}
          onClick={() => {
            setLaunchAck(false);
            setShowLaunchConfirm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-800 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Lancer l’année suivante
        </button>
      </div>

      {!selectedYearId ? (
        <div className="p-8 rounded-xl border border-[var(--app-border)] bg-slate-50/50 text-center text-slate-500">
          Sélectionnez une année académique pour afficher les classes.
        </div>
      ) : classes.length === 0 ? (
        <div className="p-8 rounded-xl border border-[var(--app-border)] bg-slate-50/50 text-center text-slate-500">
          Aucune classe dans l’école.
        </div>
      ) : (
        classGroups.map((group) => (
          <section key={group.key} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {group.label}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {group.classes.map((cls) => {
                const clsRooms = roomsByClass.get(cls.id) ?? [];
                const effectif = clsRooms.reduce((n, r) => n + (r.student_count || 0), 0);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => openClassModal(cls)}
                    className="text-left rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--school-accent-1)]/50 hover:shadow-md"
                  >
                    <div className="font-semibold text-slate-900 leading-tight">{cls.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {educationLevelLabel(cls.level)}
                      {cls.section ? ` · ${cls.section}` : ""}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {clsRooms.length} salle{clsRooms.length !== 1 ? "s" : ""}
                      </span>
                      <span className="inline-flex rounded-full bg-[var(--school-accent-1)]/10 px-2 py-0.5 text-xs font-medium text-[var(--school-accent-1)]">
                        {effectif} élève{effectif !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {openClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setOpenClass(null);
            setOpenRoomId(null);
          }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{openClass.name}</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {educationLevelLabel(openClass.level)}
                  {selectedYear ? ` · ${selectedYear.name}` : ""}
                  {isPreschoolClass ? " — Décision manuelle (préscolaire)" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpenClass(null);
                  setOpenRoomId(null);
                }}
                className="app-btn-secondary text-sm py-1.5"
              >
                Fermer
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-[var(--app-border)] bg-slate-50 px-5 py-3">
              {classStudents.length > 0 && (
                <ExportPdfButton
                  table={{
                    title: `Liste complète — ${openClass.name}`,
                    subtitle: `${selectedYear?.name ?? ""} · toutes salles`,
                    columns: [
                      ...pdfColumnsBase,
                      { header: "Salle", key: "room_name" },
                      { header: "Moyenne", key: "average" },
                      { header: "Décision", key: "decision_label" },
                    ],
                    rows: pdfRows(classStudents),
                  }}
                  filename={`liste-classe-${openClass.name}-${selectedYear?.name ?? "annee"}.pdf`}
                  label="Exporter la liste complète de la classe"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
                />
              )}
              {!isPreschoolClass && (
                <button
                  type="button"
                  onClick={handleComputeDecisions}
                  disabled={computingDecisions}
                  className="app-btn-primary text-sm disabled:opacity-60"
                >
                  {computingDecisions ? "Calcul..." : "Calculer les décisions"}
                </button>
              )}
            </div>
            <div className="overflow-y-auto p-5">
              {studentsLoading ? (
                <div className="animate-pulse py-8 text-center text-slate-500">
                  Chargement des salles...
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {openClassRooms.map((r) => {
                    const count = classStudents.filter((s) => s.room_id === r.id).length;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setOpenRoomId(r.id)}
                        className="text-left rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-sm transition hover:border-[var(--school-accent-1)]/50 hover:shadow-md"
                      >
                        <div className="font-semibold text-slate-900">{r.name}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          {count} élève{count !== 1 ? "s" : ""}
                          {r.capacity != null ? ` / ${r.capacity}` : ""}
                        </div>
                      </button>
                    );
                  })}
                  {unassignedStudents.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenRoomId(UNASSIGNED_ROOM_ID)}
                      className="text-left rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"
                    >
                      <div className="font-semibold text-slate-700">Sans salle</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {unassignedStudents.length} élève
                        {unassignedStudents.length !== 1 ? "s" : ""}
                      </div>
                    </button>
                  )}
                  {openClassRooms.length === 0 && unassignedStudents.length === 0 && (
                    <p className="col-span-full py-6 text-center text-slate-500 text-sm">
                      Aucune salle ni élève pour cette classe.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {openClass && openRoomId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpenRoomId(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {openClass.name} · {openRoomName}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {openRoomStudents.length} élève{openRoomStudents.length !== 1 ? "s" : ""}
                  {selectedYear ? ` · ${selectedYear.name}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenRoomId(null)}
                className="app-btn-secondary text-sm py-1.5"
              >
                Retour aux salles
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-[var(--app-border)] bg-slate-50 px-5 py-3">
              {openRoomStudents.length > 0 && (
                <ExportPdfButton
                  table={{
                    title: `Liste — ${openClass.name} · ${openRoomName}`,
                    subtitle: selectedYear?.name ?? "",
                    columns: [
                      ...pdfColumnsBase,
                      { header: "Moyenne", key: "average" },
                      { header: "Décision", key: "decision_label" },
                    ],
                    rows: pdfRows(openRoomStudents),
                  }}
                  filename={`liste-salle-${openClass.name}-${openRoomName}-${selectedYear?.name ?? "annee"}.pdf`}
                  label="Exporter en PDF"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
                />
              )}
              {openRoomId !== UNASSIGNED_ROOM_ID && (
                <ExportBadgePdfButton
                  label="Produire badges de la salle"
                  filename={`badges-salle-${openClass.name}-${openRoomName}`}
                  disabled={!school?.name}
                  getBlob={async () => {
                    const { students } = await fetchStudentsForRoomBadges(openRoomId);
                    return buildBadgesPdfBlob({ school, students });
                  }}
                />
              )}
            </div>
            <div className="overflow-y-auto">{studentTable(openRoomStudents)}</div>
          </div>
        </div>
      )}

      {showLaunchConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !launching && setShowLaunchConfirm(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-amber-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-amber-950">Lancer l’année suivante</h3>
            <p className="mt-2 text-sm text-slate-700">
              À partir de <strong>{selectedYear?.name}</strong>, l’école passera à{" "}
              <strong>{selectedYear ? nextYearPreview(selectedYear.name) : "l’année suivante"}</strong>.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Les décisions sont recalculées selon les moyennes (sauf préscolaire).</li>
              <li>L’année, les périodes et les horaires (mêmes professeurs) sont recopiés.</li>
              <li>Les élèves admis passent à la classe suivante ; les autres redoublent.</li>
              <li>Les élèves renvoyés ne sont pas inscrits.</li>
              <li>Vous pourrez ensuite faire de petites corrections à la main.</li>
            </ul>
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={launchAck}
                onChange={(e) => setLaunchAck(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Je confirme que les moyennes et décisions sont à jour, et que je veux lancer
                l’année suivante.
              </span>
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={launching}
                onClick={() => setShowLaunchConfirm(false)}
                className="app-btn-secondary text-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!launchAck || launching}
                onClick={handleLaunchNextYear}
                className="inline-flex items-center rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {launching ? "Lancement..." : "Confirmer et lancer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
