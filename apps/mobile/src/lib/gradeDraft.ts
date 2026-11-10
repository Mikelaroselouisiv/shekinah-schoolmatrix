import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

/** Brouillon local de saisie. Il ne va pas en base, et expire 24 h après la dernière modification. */
export const GRADE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const PREFIX = 'sm_grade_draft:';

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

export type StandardGradeCell = {
  student_id: string;
  grade_value: number | null;
  coefficient: number | null;
  detail: string;
};

export type PreschoolGradeCell = {
  student_id: string;
  level: string | null;
  frequency: string | null;
  observation: string;
  decision: string | null;
};

export type GradeDraft =
  | { kind: 'standard'; savedAt: number; cells: StandardGradeCell[] }
  | { kind: 'preschool'; savedAt: number; cells: PreschoolGradeCell[] };

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
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function standardCells(rows: StandardLike[]): StandardGradeCell[] {
  return rows.map((row) => ({
    student_id: row.student_id,
    grade_value: finiteOrNull(row.grade_value),
    coefficient: finiteOrNull(row.coefficient),
    detail: row.detail ?? '',
  }));
}

export function preschoolCells(rows: PreschoolLike[]): PreschoolGradeCell[] {
  return rows.map((row) => ({
    student_id: row.student_id,
    level: row.level || null,
    frequency: row.frequency || null,
    observation: row.observation ?? '',
    decision: row.decision || null,
  }));
}

function byStudent<T extends { student_id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.student_id.localeCompare(b.student_id));
}

export function standardFingerprint(rows: StandardLike[]): string {
  return JSON.stringify(byStudent(standardCells(rows)));
}

export function preschoolFingerprint(rows: PreschoolLike[]): string {
  return JSON.stringify(byStudent(preschoolCells(rows)));
}

export function applyStandardDraft<T extends StandardLike>(rows: T[], cells: StandardGradeCell[]): T[] {
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

export function applyPreschoolDraft<T extends PreschoolLike>(rows: T[], cells: PreschoolGradeCell[]): T[] {
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
  if (!value || typeof value !== 'object') return null;
  const draft = value as GradeDraft;
  if ((draft.kind !== 'standard' && draft.kind !== 'preschool') || typeof draft.savedAt !== 'number') {
    return null;
  }
  if (!Array.isArray(draft.cells)) return null;
  return draft;
}

async function readStored(key: string): Promise<GradeDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return asDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function readGradeDraft(scope: GradeDraftScope): Promise<GradeDraft | null> {
  const key = scopeKey(scope);
  const draft = await readStored(key);
  if (!draft) return null;
  if (Date.now() - draft.savedAt > GRADE_DRAFT_TTL_MS) {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
  return draft;
}

function draftFingerprint(draft: GradeDraft): string {
  return draft.kind === 'standard' ? standardFingerprint(draft.cells) : preschoolFingerprint(draft.cells);
}

export async function writeGradeDraft(scope: GradeDraftScope, draft: GradeDraft): Promise<void> {
  const key = scopeKey(scope);
  const existing = await readStored(key);
  const same = existing != null && existing.kind === draft.kind && draftFingerprint(existing) === draftFingerprint(draft);
  const savedAt = same ? existing.savedAt : Date.now();
  await AsyncStorage.setItem(key, JSON.stringify({ ...draft, savedAt }));
}

export async function clearGradeDraft(scope: GradeDraftScope): Promise<void> {
  await AsyncStorage.removeItem(scopeKey(scope)).catch(() => undefined);
}

let pruneQueued = false;
function schedulePrune() {
  if (pruneQueued) return;
  pruneQueued = true;
  setTimeout(() => {
    pruneQueued = false;
    void (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const now = Date.now();
        await Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX))
            .map(async (key) => {
              const draft = await readStored(key);
              if (!draft || now - draft.savedAt > GRADE_DRAFT_TTL_MS) {
                await AsyncStorage.removeItem(key);
              }
            }),
        );
      } catch {
        // le brouillon courant reste prioritaire
      }
    })();
  }, 5000);
}

let writeSeq = 0;
let writeChain: Promise<void> = Promise.resolve();

function fingerprintOf(snap: Snapshot): string {
  return snap.isPreschool ? preschoolFingerprint(snap.preschoolRows) : standardFingerprint(snap.rows);
}

/**
 * Les écritures partent dans l'ordre. Une frappe plus récente annule celles encore en file,
 * pour qu'un ancien JSON n'écrase pas la saisie qui vient d'être tapée.
 */
function enqueueWrite(run: (seq: number) => Promise<void>) {
  const seq = ++writeSeq;
  writeChain = writeChain
    .then(() => run(seq))
    .catch(() => undefined);
}

async function flushPendingWrites() {
  const seq = writeSeq;
  await writeChain;
  if (seq !== writeSeq) await writeChain;
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
  const baselineRef = useRef('');
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
    baseline: '',
    canEdit,
    ready: false,
    isPreschool,
  });

  isPreschoolRef.current = isPreschool;
  rowsRef.current = rows;
  preschoolRowsRef.current = preschoolRows;

  const scopeId = scope
    ? `${scope.userId}:${scope.academicYearId}:${scope.classId}:${scope.subjectId}:${scope.periodId}`
    : '';
  const seenScope = useRef(scopeId);
  if (seenScope.current !== scopeId) {
    seenScope.current = scopeId;
    readyRef.current = false;
    baselineRef.current = '';
  }

  const persistSnapshot = useCallback((snap: Snapshot) => {
    if (pausedRef.current || snap.gen !== genRef.current) return;
    enqueueWrite(async (seq) => {
      if (seq !== writeSeq || pausedRef.current || snap.gen !== genRef.current) return;
      if (!snap.ready || !snap.canEdit || !snap.scope) return;
      const fingerprint = fingerprintOf(snap);
      if (fingerprint === snap.baseline) {
        await clearGradeDraft(snap.scope);
        return;
      }
      const draft: GradeDraft = snap.isPreschool
        ? { kind: 'preschool', savedAt: Date.now(), cells: preschoolCells(snap.preschoolRows) }
        : { kind: 'standard', savedAt: Date.now(), cells: standardCells(snap.rows) };
      await writeGradeDraft(snap.scope, draft);
      schedulePrune();
    });
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
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') persistSnapshot(latestRef.current);
    });
    return () => sub.remove();
  }, [persistSnapshot]);

  useFocusEffect(
    useCallback(() => {
      return () => persistSnapshot(latestRef.current);
    }, [persistSnapshot]),
  );

  const fingerprint = isPreschool ? preschoolFingerprint(preschoolRows) : standardFingerprint(rows);
  const pending =
    canEdit && readyRef.current && baselineRef.current !== '' && fingerprint !== baselineRef.current;

  const hold = useCallback(() => {
    readyRef.current = false;
  }, []);

  const capture = useCallback(
    async <T extends StandardLike | PreschoolLike>(
      expected: GradeDraftScope | null,
      serverRows: T[],
      kind: 'standard' | 'preschool',
      canEditNow: boolean,
      still: () => boolean,
    ): Promise<T[]> => {
      if (!still()) return serverRows;
      const serverFp =
        kind === 'preschool'
          ? preschoolFingerprint(serverRows as PreschoolLike[])
          : standardFingerprint(serverRows as StandardLike[]);
      if (!canEditNow) {
        genRef.current += 1;
        writeSeq += 1;
        if (expected) await clearGradeDraft(expected);
        if (!still()) return serverRows;
        baselineRef.current = serverFp;
        readyRef.current = true;
        return serverRows;
      }
      const draft = expected ? await readGradeDraft(expected) : null;
      if (!still()) return serverRows;
      baselineRef.current = serverFp;
      readyRef.current = !!expected;
      if (!expected || !draft || draft.kind !== kind) return serverRows;
      if (draft.kind === 'preschool') {
        return applyPreschoolDraft(serverRows as PreschoolLike[], draft.cells) as T[];
      }
      return applyStandardDraft(serverRows as StandardLike[], draft.cells) as T[];
    },
    [],
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    genRef.current += 1;
    writeSeq += 1;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  const forget = useCallback(async (expected: GradeDraftScope | null) => {
    pausedRef.current = true;
    genRef.current += 1;
    writeSeq += 1;
    await flushPendingWrites();
    if (expected) await clearGradeDraft(expected);
  }, []);

  const acceptCurrent = useCallback(() => {
    baselineRef.current = isPreschoolRef.current
      ? preschoolFingerprint(preschoolRowsRef.current)
      : standardFingerprint(rowsRef.current);
  }, []);

  return { pending, hold, capture, pause, resume, forget, acceptCurrent };
}
