import { useCallback, useEffect, useRef } from "react";

/** Brouillon local de saisie. Il ne va pas en base, et expire 24 h après la dernière modification. */
export const GRADE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const PREFIX = "sm_grade_draft:";

export type GradeDraftScope = {
  userId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  periodId: string;
};

type StandardLike = {
  student_id: string;
  grade_value?: number | null;
  coefficient?: number | null;
  detail?: string | null;
};

type PreschoolLike = {
  student_id: string;
  level?: string | null;
  frequency?: string | null;
  observation?: string | null;
  decision?: string | null;
};

type StandardGradeCell = {
  student_id: string;
  grade_value: number | null;
  coefficient: number | null;
  detail: string;
};

type PreschoolGradeCell = {
  student_id: string;
  level: string | null;
  frequency: string | null;
  observation: string;
  decision: string | null;
};

type GradeDraft =
  | { kind: "standard"; savedAt: number; cells: StandardGradeCell[] }
  | { kind: "preschool"; savedAt: number; cells: PreschoolGradeCell[] };

type Snapshot = {
  gen: number;
  scope: GradeDraftScope | null;
  rows: StandardLike[];
  preschoolRows: PreschoolLike[];
  baseline: string;
  canEdit: boolean;
  ready: boolean;
  isPreschool: boolean;
};

function scopeKey(scope: GradeDraftScope) {
  return `${PREFIX}${scope.userId}:${scope.academicYearId}:${scope.classId}:${scope.subjectId}:${scope.periodId}`;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function standardCells(rows: StandardLike[]): StandardGradeCell[] {
  return rows.map((row) => ({
    student_id: row.student_id,
    grade_value: finiteOrNull(row.grade_value),
    coefficient: finiteOrNull(row.coefficient),
    detail: row.detail ?? "",
  }));
}

function preschoolCells(rows: PreschoolLike[]): PreschoolGradeCell[] {
  return rows.map((row) => ({
    student_id: row.student_id,
    level: row.level || null,
    frequency: row.frequency || null,
    observation: row.observation ?? "",
    decision: row.decision || null,
  }));
}

function byStudent<T extends { student_id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.student_id.localeCompare(b.student_id));
}

function standardFingerprint(rows: StandardLike[]): string {
  return JSON.stringify(byStudent(standardCells(rows)));
}

function preschoolFingerprint(rows: PreschoolLike[]): string {
  return JSON.stringify(byStudent(preschoolCells(rows)));
}

function applyStandardDraft<T extends StandardLike>(rows: T[], cells: StandardGradeCell[]): T[] {
  const byId = new Map(cells.map((cell) => [cell.student_id, cell]));
  return rows.map((row) => {
    const cell = byId.get(row.student_id);
    if (!cell) return row;
    return {
      ...row,
      grade_value: cell.grade_value,
      coefficient: cell.coefficient ?? row.coefficient ?? null,
      detail: cell.detail,
    };
  });
}

function applyPreschoolDraft<T extends PreschoolLike>(rows: T[], cells: PreschoolGradeCell[]): T[] {
  const byId = new Map(cells.map((cell) => [cell.student_id, cell]));
  return rows.map((row) => {
    const cell = byId.get(row.student_id);
    if (!cell) return row;
    return {
      ...row,
      level: cell.level,
      frequency: cell.frequency,
      observation: cell.observation,
      decision: cell.decision,
    };
  });
}

function asDraft(value: unknown): GradeDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as GradeDraft;
  if ((draft.kind !== "standard" && draft.kind !== "preschool") || typeof draft.savedAt !== "number") {
    return null;
  }
  if (!Array.isArray(draft.cells)) return null;
  return draft;
}

function readStored(key: string): GradeDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return asDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readGradeDraft(scope: GradeDraftScope): GradeDraft | null {
  const key = scopeKey(scope);
  const draft = readStored(key);
  if (!draft) return null;
  if (Date.now() - draft.savedAt > GRADE_DRAFT_TTL_MS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
  return draft;
}

function draftFingerprint(draft: GradeDraft): string {
  return draft.kind === "standard" ? standardFingerprint(draft.cells) : preschoolFingerprint(draft.cells);
}

function writeGradeDraft(scope: GradeDraftScope, draft: GradeDraft) {
  const key = scopeKey(scope);
  const existing = readStored(key);
  const same = existing != null && existing.kind === draft.kind && draftFingerprint(existing) === draftFingerprint(draft);
  const savedAt = same ? existing.savedAt : Date.now();
  localStorage.setItem(key, JSON.stringify({ ...draft, savedAt }));
}

function clearGradeDraft(scope: GradeDraftScope) {
  try {
    localStorage.removeItem(scopeKey(scope));
  } catch {
    /* ignore */
  }
}

let pruneTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePrune() {
  if (pruneTimer != null) return;
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    try {
      const now = Date.now();
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREFIX)) continue;
        const draft = readStored(key);
        if (!draft || now - draft.savedAt > GRADE_DRAFT_TTL_MS) localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  }, 5000);
}

function fingerprintOf(snap: Snapshot): string {
  return snap.isPreschool ? preschoolFingerprint(snap.preschoolRows) : standardFingerprint(snap.rows);
}

export function useGradeEntryDraft(args: {
  scope: GradeDraftScope | null;
  canEdit: boolean;
  isPreschool: boolean;
  rows: StandardLike[];
  preschoolRows: PreschoolLike[];
}) {
  const { scope, canEdit, isPreschool, rows, preschoolRows } = args;
  const genRef = useRef(0);
  const baselineRef = useRef("");
  const readyRef = useRef(false);
  const pausedRef = useRef(false);
  const isPreschoolRef = useRef(isPreschool);
  const rowsRef = useRef(rows);
  const preschoolRowsRef = useRef(preschoolRows);
  const latestRef = useRef<Snapshot>({
    gen: 0,
    scope,
    rows,
    preschoolRows,
    baseline: "",
    canEdit,
    ready: false,
    isPreschool,
  });

  isPreschoolRef.current = isPreschool;
  rowsRef.current = rows;
  preschoolRowsRef.current = preschoolRows;

  const scopeId = scope
    ? `${scope.userId}:${scope.academicYearId}:${scope.classId}:${scope.subjectId}:${scope.periodId}`
    : "";
  const seenScope = useRef(scopeId);
  if (seenScope.current !== scopeId) {
    seenScope.current = scopeId;
    readyRef.current = false;
    baselineRef.current = "";
  }

  const persistSnapshot = useCallback((snap: Snapshot) => {
    try {
      if (pausedRef.current || snap.gen !== genRef.current) return;
      if (!snap.ready || !snap.canEdit || !snap.scope) return;
      const fingerprint = fingerprintOf(snap);
      if (fingerprint === snap.baseline) {
        clearGradeDraft(snap.scope);
        return;
      }
      const draft: GradeDraft = snap.isPreschool
        ? { kind: "preschool", savedAt: Date.now(), cells: preschoolCells(snap.preschoolRows) }
        : { kind: "standard", savedAt: Date.now(), cells: standardCells(snap.rows) };
      writeGradeDraft(snap.scope, draft);
      schedulePrune();
    } catch {
      /* quota */
    }
  }, []);

  latestRef.current = {
    gen: genRef.current,
    scope,
    rows,
    preschoolRows,
    baseline: baselineRef.current,
    canEdit,
    ready: readyRef.current,
    isPreschool,
  };

  useEffect(() => {
    const snap = latestRef.current;
    persistSnapshot(snap);
    return () => persistSnapshot(snap);
  }, [scopeId, rows, preschoolRows, canEdit, isPreschool, persistSnapshot]);

  useEffect(() => {
    const flush = () => persistSnapshot(latestRef.current);
    window.addEventListener("pagehide", flush);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [persistSnapshot]);

  const fingerprint = isPreschool ? preschoolFingerprint(preschoolRows) : standardFingerprint(rows);
  const pending =
    canEdit && readyRef.current && baselineRef.current !== "" && fingerprint !== baselineRef.current;

  const hold = useCallback(() => {
    readyRef.current = false;
  }, []);

  const capture = useCallback(
    <T extends StandardLike | PreschoolLike>(
      expected: GradeDraftScope | null,
      serverRows: T[],
      kind: "standard" | "preschool",
      canEditNow: boolean,
      still: () => boolean,
    ): T[] => {
      if (!still()) return serverRows;
      const serverFp =
        kind === "preschool"
          ? preschoolFingerprint(serverRows as PreschoolLike[])
          : standardFingerprint(serverRows as StandardLike[]);
      if (!canEditNow) {
        genRef.current += 1;
        if (expected) clearGradeDraft(expected);
        if (!still()) return serverRows;
        baselineRef.current = serverFp;
        readyRef.current = true;
        return serverRows;
      }
      const draft = expected ? readGradeDraft(expected) : null;
      if (!still()) return serverRows;
      baselineRef.current = serverFp;
      readyRef.current = !!expected;
      if (!expected || !draft || draft.kind !== kind) return serverRows;
      if (draft.kind === "preschool") {
        return applyPreschoolDraft(serverRows as PreschoolLike[], draft.cells) as T[];
      }
      return applyStandardDraft(serverRows as StandardLike[], draft.cells) as T[];
    },
    [],
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    genRef.current += 1;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  const forget = useCallback((expected: GradeDraftScope | null) => {
    pausedRef.current = true;
    genRef.current += 1;
    if (expected) clearGradeDraft(expected);
  }, []);

  const acceptCurrent = useCallback(() => {
    baselineRef.current = isPreschoolRef.current
      ? preschoolFingerprint(preschoolRowsRef.current)
      : standardFingerprint(rowsRef.current);
  }, []);

  return { pending, hold, capture, pause, resume, forget, acceptCurrent };
}
