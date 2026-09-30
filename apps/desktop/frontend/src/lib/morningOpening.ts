export const MORNING_WEEKDAYS = [
  { index: 1, label: "Lundi" },
  { index: 2, label: "Mardi" },
  { index: 3, label: "Mercredi" },
  { index: 4, label: "Jeudi" },
  { index: 5, label: "Vendredi" },
] as const;

export const WEEKDAY_LABELS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

export const MORNING_OPENING_LEVELS = [
  "PRESCOLAIRE",
  "FONDAMENTAL_1",
  "FONDAMENTAL_2",
] as const;

export const MORNING_PRIMAIRE_LEVELS = ["FONDAMENTAL_1", "FONDAMENTAL_2"] as const;

export const LIST_SCHEDULE_LEVELS = [
  "PRESCOLAIRE",
  "FONDAMENTAL_1",
  "FONDAMENTAL_2",
] as const;

export type MorningCycle = "PRESCOLAIRE" | "PRIMAIRE";

export function morningCycleFromLevel(level?: string | null): MorningCycle | null {
  const key = (level ?? "").toUpperCase().trim();
  if (key === "PRESCOLAIRE") return "PRESCOLAIRE";
  if (key === "FONDAMENTAL_1" || key === "FONDAMENTAL_2") return "PRIMAIRE";
  return null;
}

export function isMorningOpeningLevel(level?: string | null): boolean {
  return !!level && (MORNING_OPENING_LEVELS as readonly string[]).includes(level);
}

export function isListScheduleLevel(level?: string | null): boolean {
  return !!level && (LIST_SCHEDULE_LEVELS as readonly string[]).includes(level);
}

export function isTimedScheduleLevel(level?: string | null): boolean {
  return !!level && !isListScheduleLevel(level);
}

export type MorningDuty = {
  id?: string;
  kind: string;
  cycle?: string | null;
  day_of_week: number;
  class_id?: string | null;
  class_name?: string | null;
  responsible_user_id?: number | null;
  responsible_name?: string | null;
  manual_name?: string | null;
  title?: string;
};

export type DayMorningProgram = {
  preschoolAccueilIds: number[];
  preschoolFlagIds: number[];
  preschoolAnimationIds: number[];
  preschoolServiceNames: string[];
  primaryAccueilIds: number[];
  primaryDevotionIds: number[];
  primaryFlagClassId: string;
  primaryDefiIds: number[];
  primaryPrayerNames: string[];
};

export function emptyDayProgram(): DayMorningProgram {
  return {
    preschoolAccueilIds: [],
    preschoolFlagIds: [],
    preschoolAnimationIds: [],
    preschoolServiceNames: [],
    primaryAccueilIds: [],
    primaryDevotionIds: [],
    primaryFlagClassId: "",
    primaryDefiIds: [],
    primaryPrayerNames: [],
  };
}

export function emptyWeekProgram(): Record<number, DayMorningProgram> {
  return {
    1: emptyDayProgram(),
    2: emptyDayProgram(),
    3: emptyDayProgram(),
    4: emptyDayProgram(),
    5: emptyDayProgram(),
  };
}

function pushUnique(list: number[], id: number | null | undefined) {
  if (id == null || list.includes(id)) return;
  list.push(id);
}

function pushName(list: string[], name?: string | null) {
  const n = (name ?? "").trim();
  if (!n || list.some((x) => x.toLowerCase() === n.toLowerCase())) return;
  list.push(n);
}

export function programFromDuties(duties: MorningDuty[]): Record<number, DayMorningProgram> {
  const next = emptyWeekProgram();
  for (const d of duties) {
    const slot = next[d.day_of_week];
    if (!slot) continue;
    const kind = (d.kind || "").toUpperCase();
    const cycle = (d.cycle || "").toUpperCase();
    if (kind === "FLAG" && cycle === "PRIMAIRE" && d.class_id) {
      slot.primaryFlagClassId = d.class_id;
    } else if (kind === "FLAG" && cycle !== "PRIMAIRE") {
      pushUnique(slot.preschoolFlagIds, d.responsible_user_id);
    } else if ((kind === "ACCUEIL" || kind === "RENTREE") && cycle === "PRESCOLAIRE") {
      pushUnique(slot.preschoolAccueilIds, d.responsible_user_id);
    } else if ((kind === "ACCUEIL" || kind === "RENTREE") && cycle !== "PRESCOLAIRE") {
      pushUnique(slot.primaryAccueilIds, d.responsible_user_id);
    } else if (kind === "ANIMATION") {
      pushUnique(slot.preschoolAnimationIds, d.responsible_user_id);
    } else if (kind === "SERVICE") {
      pushName(slot.preschoolServiceNames, d.manual_name || d.responsible_name);
    } else if (kind === "DEVOTION") {
      pushUnique(slot.primaryDevotionIds, d.responsible_user_id);
    } else if (kind === "DEFI") {
      pushUnique(slot.primaryDefiIds, d.responsible_user_id);
    } else if (kind === "PRIERE") {
      pushName(slot.primaryPrayerNames, d.manual_name || d.responsible_name);
    }
  }
  return next;
}

export function dutyDisplayTitle(d: MorningDuty): string {
  const kind = (d.kind || "").toUpperCase();
  const cycle = (d.cycle || "").toUpperCase();
  if (kind === "FLAG" && cycle === "PRESCOLAIRE") return "Montée du drapeau";
  if (kind === "FLAG") return "Montée du drapeau";
  if (kind === "ACCUEIL" || kind === "RENTREE") return "Accueil";
  if (kind === "ANIMATION") return "Animation";
  if (kind === "SERVICE") return "Dames de service";
  if (kind === "DEVOTION") return "Dévotion";
  if (kind === "DEFI") return "Défi des 5 phrases";
  if (kind === "PRIERE") return "Prière de midi";
  return d.title || kind;
}

export function dutiesForStudent(
  duties: MorningDuty[],
  classId?: string | null,
  level?: string | null,
): MorningDuty[] {
  const cycle = morningCycleFromLevel(level);
  return duties.filter((d) => {
    const kind = (d.kind || "").toUpperCase();
    if (kind === "FLAG" && d.class_id) return !!classId && d.class_id === classId;
    return !!cycle && d.cycle === cycle;
  });
}

export function dutiesForTeacher(
  duties: MorningDuty[],
  userId?: number | null,
  classIds: string[] = [],
): MorningDuty[] {
  return duties.filter((d) => {
    const kind = (d.kind || "").toUpperCase();
    if (kind === "FLAG" && d.class_id) return !!d.class_id && classIds.includes(d.class_id);
    if (kind === "SERVICE" || kind === "PRIERE") return false;
    return userId != null && d.responsible_user_id === userId;
  });
}

export function uniqueTeachersFromAssignments(
  assignments: { teacher_id?: number; teacher_name?: string; class_id: string }[],
  classIds: Set<string>,
): { id: number; name: string }[] {
  const map = new Map<number, string>();
  for (const a of assignments) {
    if (!classIds.has(a.class_id) || a.teacher_id == null) continue;
    if (!map.has(a.teacher_id)) {
      map.set(a.teacher_id, a.teacher_name?.trim() || `#${a.teacher_id}`);
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function weekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index] ?? `Jour ${index}`;
}

export function tomorrowWeekdayIndex(now = new Date()): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return d.getDay();
}

export function namesJoin(names: string[]): string {
  const list = names.filter(Boolean);
  if (list.length === 0) return "—";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} et ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} et ${list[list.length - 1]}`;
}

export function dayHasPreschool(slot?: DayMorningProgram | null): boolean {
  if (!slot) return false;
  return !!(
    slot.preschoolAccueilIds.length ||
    slot.preschoolFlagIds.length ||
    slot.preschoolAnimationIds.length ||
    slot.preschoolServiceNames.length
  );
}

export function emptyClassDayLists(): Record<number, { subjectIds: string[]; materials: string[] }> {
  return {
    1: { subjectIds: [], materials: [] },
    2: { subjectIds: [], materials: [] },
    3: { subjectIds: [], materials: [] },
    4: { subjectIds: [], materials: [] },
    5: { subjectIds: [], materials: [] },
  };
}

export type ClassDayListRow = {
  day_of_week: number;
  subject_ids?: string[];
  subject_names?: string[];
  materials?: string[];
};

export function classDayListsFromApi(
  rows?: ClassDayListRow[] | null,
): Record<number, { subjectIds: string[]; materials: string[] }> {
  const next = emptyClassDayLists();
  for (const row of rows ?? []) {
    const slot = next[row.day_of_week];
    if (!slot) continue;
    slot.subjectIds = [...(row.subject_ids ?? [])];
    slot.materials = [...(row.materials ?? [])];
  }
  return next;
}

export function mergeMaterialCatalog(...groups: (string[] | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const raw of group ?? []) {
      const label = String(raw ?? "").trim().replace(/\s+/g, " ");
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}

export function toggleMaterialLabel(values: string[], label: string): string[] {
  const key = label.trim().toLowerCase();
  if (!key) return values;
  if (values.some((x) => x.toLowerCase() === key)) {
    return values.filter((x) => x.toLowerCase() !== key);
  }
  return [...values, label.trim().replace(/\s+/g, " ")];
}

export function ensureMaterialLabel(values: string[], label: string): string[] {
  const key = label.trim().toLowerCase();
  if (!key) return values;
  if (values.some((x) => x.toLowerCase() === key)) return values;
  return [...values, label.trim().replace(/\s+/g, " ")];
}

export function dayHasPrimary(slot?: DayMorningProgram | null): boolean {
  if (!slot) return false;
  return !!(
    slot.primaryAccueilIds.length ||
    slot.primaryDevotionIds.length ||
    slot.primaryFlagClassId ||
    slot.primaryDefiIds.length ||
    slot.primaryPrayerNames.length
  );
}
