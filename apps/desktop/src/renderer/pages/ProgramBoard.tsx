import { useEffect, useMemo, useState } from "react";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { EDUCATION_LEVELS, educationLevelLabel } from "@/lib/educationLevels";
import { formatDateJJMMAAAA } from "@/lib/format";
import { isListScheduleLevel, morningCycleFromLevel } from "@/lib/morningOpening";
import { formatClock, formatShortDate, haitiToday } from "@/lib/monitoringLoad";
import type { PdfSection } from "@/lib/pdfExport";
import { API_BASE, fetchWithAuth } from "@/services/api";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const WEEK = [1, 2, 3, 4, 5];

type AccueilDuty = {
  kind: string;
  cycle: string | null;
  day_of_week: number;
  responsible_name: string | null;
};

function haitiWeekday(): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Port-au-Prince",
    weekday: "short",
  }).format(new Date());
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[name] ?? 0;
}

function accueilNames(duties: AccueilDuty[], cycle: string, day: number): string {
  const names = duties
    .filter((duty) => {
      const kind = (duty.kind || "").toUpperCase();
      return (kind === "ACCUEIL" || kind === "RENTREE") && (duty.cycle || "").toUpperCase() === cycle && duty.day_of_week === day;
    })
    .map((duty) => (duty.responsible_name || "").trim())
    .filter(Boolean);
  return [...new Set(names)].join(", ") || "—";
}

type Vacation = {
  id: string;
  start_date: string;
  end_date: string;
  motif: string;
  kind: string;
  class_id: string | null;
  class_name: string | null;
};

type Slot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject_name: string | null;
  class_id?: string | null;
  class_name: string | null;
  teacher_name: string | null;
  room_id?: string | null;
  room_name: string | null;
  kind?: string;
};

type DayList = { day_of_week: number; subject_names: string[] };

type RoomCard = {
  key: string;
  roomId: string | null;
  roomName: string | null;
  classId: string;
  className: string;
  level: string | null;
};

type VacationGroup = {
  key: string;
  kind: string;
  motif: string;
  start_date: string;
  end_date: string;
  classes: string[];
};

async function readJson<T>(path: string): Promise<T | null> {
  const res = await fetchWithAuth(`${API_BASE}${path}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) return null;
  return data as T;
}

function kindLabel(kind: string): string {
  return kind === "CONGE" ? "Congé" : "Vacance";
}

function groupVacations(rows: Vacation[]): VacationGroup[] {
  const map = new Map<string, VacationGroup>();
  for (const row of rows) {
    const key = `${row.kind}|${row.motif}|${row.start_date}|${row.end_date}`;
    const group = map.get(key) ?? {
      key,
      kind: row.kind,
      motif: row.motif,
      start_date: row.start_date,
      end_date: row.end_date,
      classes: [],
    };
    const name = row.class_name?.trim();
    if (name && !group.classes.includes(name)) group.classes.push(name);
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));
}

function cyclesOf(rooms: RoomCard[]) {
  const order = EDUCATION_LEVELS.map((item) => item.key);
  const groups = new Map<string, RoomCard[]>();
  for (const room of rooms) {
    const key = (room.level || "AUTRE").toUpperCase();
    const list = groups.get(key) ?? [];
    list.push(room);
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
      rooms: items,
    }));
}

export function ProgramBoard({
  mode,
  userId,
  preview = false,
  reloadKey = 0,
  onOpen,
}: {
  mode: "school" | "parent" | "teacher";
  userId?: number;
  preview?: boolean;
  reloadKey?: number;
  onOpen?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [vacations, setVacations] = useState<VacationGroup[]>([]);
  const [accueil, setAccueil] = useState<{ prescolaire: string | null; primaire: string | null }>({
    prescolaire: null,
    primaire: null,
  });
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [yearName, setYearName] = useState<string | null>(null);
  const [knownSlots, setKnownSlots] = useState<Slot[]>([]);
  const [knownDays, setKnownDays] = useState<Record<string, DayList[]>>({});
  const [open, setOpen] = useState<RoomCard | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [days, setDays] = useState<DayList[]>([]);
  const [slotLoading, setSlotLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const today = haitiToday();
      const ctx = await readJson<{
        current_academic_year_id?: string | null;
        current_academic_year_name?: string | null;
      }>("/school/current-context");
      const yearId = ctx?.current_academic_year_id ?? "";
      const year = ctx?.current_academic_year_name ?? null;
      const vacData = await readJson<{ school_vacations?: Vacation[] }>(
        `/school-vacations${yearId ? `?academic_year_id=${encodeURIComponent(yearId)}` : ""}`,
      );
      let nextRooms: RoomCard[] = [];
      let nextSlots: Slot[] = [];
      let nextDays: Record<string, DayList[]> = {};
      let classIds = new Set<string>();
      let duties: AccueilDuty[] = [];
      const cycles = new Set<string>();

      if (mode === "parent") {
        const linked = await readJson<{
          linked_students?: { id: string; class_id?: string }[];
        }>("/users/me/linked-students");
        const students = linked?.linked_students ?? [];
        const seen = new Set<string>();
        for (const student of students) {
          if (student.class_id) classIds.add(student.class_id);
          const yearQs = year ? `?academic_year=${encodeURIComponent(year)}` : "";
          const data = await readJson<{
            class_id?: string | null;
            class_name?: string | null;
            class_level?: string | null;
            room_id?: string | null;
            room_name?: string | null;
            slots?: Slot[];
            day_lists?: DayList[];
          }>(`/schedule/student/${student.id}${yearQs}`);
          if (!data) continue;
          if (data.class_id) classIds.add(data.class_id);
          const cycle = morningCycleFromLevel(data.class_level);
          if (cycle) cycles.add(cycle);
          for (const slot of data.slots ?? []) {
            const kind = (slot.kind || "").toUpperCase();
            if (kind !== "ACCUEIL" && kind !== "RENTREE") continue;
            const title = (slot.subject_name || "").toLowerCase();
            duties.push({
              kind,
              cycle: title.includes("préscolaire") || title.includes("prescolaire") ? "PRESCOLAIRE" : "PRIMAIRE",
              day_of_week: slot.day_of_week,
              responsible_name: slot.teacher_name,
            });
          }
          const courses = (data.slots ?? []).filter((slot) => !slot.kind || slot.kind === "COURSE");
          nextSlots.push(...courses);
          if (data.class_id && data.day_lists?.length) nextDays[data.class_id] = data.day_lists;
          const key = `${data.class_id || student.class_id || student.id}:${data.room_id || "sans"}`;
          if (seen.has(key)) continue;
          seen.add(key);
          nextRooms.push({
            key,
            roomId: data.room_id ?? null,
            roomName: data.room_name ?? null,
            classId: data.class_id || student.class_id || "",
            className: data.class_name || "—",
            level: data.class_level ?? null,
          });
        }
      } else if (mode === "teacher" && userId) {
        const yearQs = year ? `&academic_year=${encodeURIComponent(year)}` : "";
        const data = await readJson<{ schedule_slots?: Slot[] }>(
          `/schedule-slots?teacher_id=${userId}${yearQs}`,
        );
        nextSlots = data?.schedule_slots ?? [];
        const seen = new Set<string>();
        for (const slot of nextSlots) {
          if (slot.class_id) classIds.add(slot.class_id);
          const key = `${slot.class_id || "classe"}:${slot.room_id || "sans"}`;
          if (seen.has(key)) continue;
          seen.add(key);
          nextRooms.push({
            key,
            roomId: slot.room_id ?? null,
            roomName: slot.room_name ?? null,
            classId: slot.class_id || "",
            className: slot.class_name || "—",
            level: null,
          });
        }
      } else {
        const data = await readJson<{
          classes?: { id: string; name: string; level?: string | null; active?: boolean; rooms?: { id: string; name: string }[] }[];
        }>("/classes");
        for (const klass of data?.classes ?? []) {
          if (klass.active === false) continue;
          classIds.add(klass.id);
          const list = klass.rooms ?? [];
          if (!list.length) {
            nextRooms.push({
              key: `${klass.id}:sans`,
              roomId: null,
              roomName: null,
              classId: klass.id,
              className: klass.name,
              level: klass.level ?? null,
            });
            continue;
          }
          for (const room of list) {
            nextRooms.push({
              key: `${klass.id}:${room.id}`,
              roomId: room.id,
              roomName: room.name,
              classId: klass.id,
              className: klass.name,
              level: klass.level ?? null,
            });
          }
        }
      }

      if (mode !== "parent" && year) {
        const dutyData = await readJson<{ school_week_duties?: AccueilDuty[] }>(
          `/school-week-duties?academic_year=${encodeURIComponent(year)}`,
        );
        duties = dutyData?.school_week_duties ?? [];
        cycles.add("PRESCOLAIRE");
        cycles.add("PRIMAIRE");
      }
      const weekday = haitiWeekday();
      const nextAccueil = {
        prescolaire: cycles.has("PRESCOLAIRE") ? accueilNames(duties, "PRESCOLAIRE", weekday) : null,
        primaire: cycles.has("PRIMAIRE") ? accueilNames(duties, "PRIMAIRE", weekday) : null,
      };

      const upcoming = (vacData?.school_vacations ?? []).filter((row) => {
        if ((row.end_date || "").slice(0, 10) < today) return false;
        if (!row.class_id) return true;
        return classIds.has(row.class_id);
      });
      if (cancelled) return;
      setYearName(year);
      setAccueil(nextAccueil);
      setRooms(nextRooms.sort((a, b) => a.className.localeCompare(b.className, "fr") || (a.roomName || "").localeCompare(b.roomName || "", "fr")));
      setVacations(groupVacations(upcoming));
      setKnownSlots(nextSlots);
      setKnownDays(nextDays);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, userId, reloadKey]);

  const pdf = useMemo(() => {
    if (preview) return null;
    const sections: PdfSection[] = [
      {
        title: "Accueil",
        lines: [
          ...(accueil.prescolaire != null ? [`Préscolaire : ${accueil.prescolaire}`] : []),
          ...(accueil.primaire != null ? [`Primaire : ${accueil.primaire}`] : []),
        ],
      },
      {
        title: "Congés",
        table: {
          columns: [
            { header: "Type", key: "type" },
            { header: "Du", key: "du" },
            { header: "Au", key: "au" },
            { header: "Motif", key: "motif" },
            { header: "Classes", key: "classes" },
          ],
          rows: vacations.map((row) => ({
            type: kindLabel(row.kind),
            du: formatShortDate(row.start_date),
            au: formatShortDate(row.end_date),
            motif: row.motif,
            classes: row.classes.join(", ") || "—",
          })),
        },
      },
      {
        title: "Salles",
        table: {
          columns: [
            { header: "Salle", key: "salle" },
            { header: "Classe", key: "classe" },
          ],
          rows: rooms.map((room) => ({
            salle: room.roomName || "—",
            classe: room.className,
          })),
        },
      },
    ];
    return { title: "Programmation", filename: `programmation-${haitiToday()}`, sections };
  }, [preview, vacations, rooms, accueil]);

  useEffect(() => {
    if (!open) return;
    const cached = knownSlots.filter((slot) =>
      open.roomId ? slot.room_id === open.roomId : slot.class_id === open.classId,
    );
    const cachedDays = knownDays[open.classId] ?? [];
    if (mode !== "school") {
      setSlots(cached);
      setDays(cachedDays);
      setSlotLoading(false);
      return;
    }
    let cancelled = false;
    setSlotLoading(true);
    setSlots([]);
    setDays([]);
    (async () => {
      const q = new URLSearchParams();
      if (open.roomId) q.set("room_id", open.roomId);
      else if (open.classId) q.set("class_id", open.classId);
      if (yearName) q.set("academic_year", yearName);
      const data = await readJson<{ schedule_slots?: Slot[] }>(`/schedule-slots?${q.toString()}`);
      let lists: DayList[] = [];
      if (open.classId && isListScheduleLevel(open.level)) {
        const dayData = await readJson<{ days?: DayList[] }>(
          `/class-day-lists?class_id=${encodeURIComponent(open.classId)}${yearName ? `&academic_year=${encodeURIComponent(yearName)}` : ""}`,
        );
        lists = dayData?.days ?? [];
      }
      if (cancelled) return;
      setSlots(data?.schedule_slots ?? []);
      setDays(lists);
      setSlotLoading(false);
    })().catch(() => {
      if (!cancelled) setSlotLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, mode, yearName, knownSlots, knownDays]);

  const shownVacations = preview ? vacations.slice(0, 4) : vacations;
  const roomPdf: PdfSection[] = open
    ? [
        {
          lines: [open.roomName ? `${open.roomName} · ${open.className}` : open.className],
        },
        {
          title: "Emploi du temps",
          table: {
            columns: [
              { header: "Jour", key: "jour" },
              { header: "Horaire", key: "horaire" },
              { header: "Matière", key: "matiere" },
              { header: "Classe", key: "classe" },
              { header: "Professeur", key: "prof" },
            ],
            rows: slots.map((slot) => ({
              jour: DAYS[slot.day_of_week] || "—",
              horaire: `${formatClock(slot.start_time)} – ${formatClock(slot.end_time)}`,
              matiere: slot.subject_name || "—",
              classe: slot.class_name || open.className,
              prof: slot.teacher_name || "—",
            })),
          },
        },
        ...(days.length
          ? [{
              title: "Matières",
              table: {
                columns: [
                  { header: "Jour", key: "jour" },
                  { header: "Matières", key: "matieres" },
                ],
                rows: days.map((day) => ({
                  jour: DAYS[day.day_of_week] || "—",
                  matieres: day.subject_names.join(", ") || "—",
                })),
              },
            } satisfies PdfSection]
          : []),
      ]
    : [];

  return (
    <>
      <section className={preview ? "monitor-journal-block" : "monitor-block"}>
        <div className="monitor-panel-head">
          <h2 className="monitor-title">Accueil</h2>
          {preview && onOpen ? (
            <button type="button" className="monitor-jump" onClick={onOpen}>
              Programmation
            </button>
          ) : null}
          {!preview && pdf ? (
            <ExportPdfButton
              label="PDF"
              className="monitor-btn"
              filename={pdf.filename}
              mainTitle={pdf.title}
              sections={pdf.sections}
              disabled={loading}
            />
          ) : null}
        </div>
        {loading ? (
          <p className="monitor-note">Chargement...</p>
        ) : (
          <>
            {accueil.prescolaire != null && (
              <div className="monitor-line">
                <span>Préscolaire</span>
                <span>{accueil.prescolaire}</span>
              </div>
            )}
            {accueil.primaire != null && (
              <div className="monitor-line">
                <span>Primaire</span>
                <span>{accueil.primaire}</span>
              </div>
            )}
          </>
        )}
        <h2 className="monitor-title">Congés</h2>
        {loading ? null : shownVacations.length === 0 ? (
          <p className="monitor-empty">Aucun congé</p>
        ) : (
          shownVacations.map((row) => (
            <div key={row.key} className="monitor-line">
              <span>
                {kindLabel(row.kind)} · {row.motif}
              </span>
              <span>
                {formatDateJJMMAAAA(row.start_date)} – {formatDateJJMMAAAA(row.end_date)}
                {row.classes.length ? ` · ${row.classes.join(", ")}` : ""}
              </span>
            </div>
          ))
        )}
      </section>

      {!preview && (
        <section className="monitor-block">
          <h2 className="monitor-title">Emploi du temps</h2>
          {loading ? (
            <p className="monitor-note">Chargement...</p>
          ) : rooms.length === 0 ? (
            <p className="monitor-empty">Aucune salle</p>
          ) : (
            <div className="monitor-cycles">
              {cyclesOf(rooms).map((cycle, _index, all) => (
                <section key={cycle.key} className="monitor-cycle">
                  {all.length > 1 || cycle.key !== "AUTRE" ? (
                    <h3 className="monitor-cycle-title">{cycle.label}</h3>
                  ) : null}
                  <div className="monitor-rooms">
                    {cycle.rooms.map((room) => (
                      <button
                        key={room.key}
                        type="button"
                        className="monitor-room"
                        onClick={() => setOpen(room)}
                      >
                        <div className="monitor-room-top">
                          <div>
                            {room.roomName ? <p className="monitor-room-kicker">{room.className}</p> : null}
                            <p className="monitor-room-name">{room.roomName || room.className}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      {open && (
        <div className="monitor-modal-back" onClick={() => setOpen(null)}>
          <div
            className="monitor-modal wide"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="monitor-student-head">
              <div>
                <h2 className="monitor-title">{open.roomName || open.className}</h2>
                {open.roomName ? <p className="monitor-student-class">{open.className}</p> : null}
              </div>
              <div className="monitor-student-actions">
                <ExportPdfButton
                  label="PDF"
                  className="monitor-btn"
                  filename={`emploi-${(open.roomName || open.className).replace(/\s+/g, "-")}`}
                  mainTitle={`${open.roomName || open.className} — Emploi du temps`}
                  sections={roomPdf}
                  disabled={slotLoading}
                />
                <button type="button" className="monitor-btn" onClick={() => setOpen(null)}>
                  Fermer
                </button>
              </div>
            </div>
            {slotLoading ? (
              <p className="monitor-note">Chargement...</p>
            ) : (
              <>
                {WEEK.map((day) => {
                  const rows = slots
                    .filter((slot) => slot.day_of_week === day)
                    .sort((a, b) => a.start_time.localeCompare(b.start_time));
                  if (!rows.length) return null;
                  return (
                    <div key={day} className="monitor-block">
                      <h3 className="monitor-cycle-title">{DAYS[day]}</h3>
                      {rows.map((slot) => (
                        <div key={slot.id} className="monitor-line">
                          <span>
                            {formatClock(slot.start_time)} – {formatClock(slot.end_time)} · {slot.subject_name || "—"}
                          </span>
                          <span>{[slot.class_name, slot.teacher_name].filter(Boolean).join(" · ") || "—"}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {slots.length === 0 && days.length === 0 ? <p className="monitor-empty">Aucun cours</p> : null}
                {days.length > 0 && (
                  <div className="monitor-block">
                    <h3 className="monitor-cycle-title">Matières</h3>
                    {days.map((day) => (
                      <div key={day.day_of_week} className="monitor-line">
                        <span>{DAYS[day.day_of_week] || "—"}</span>
                        <span>{day.subject_names.join(", ") || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
