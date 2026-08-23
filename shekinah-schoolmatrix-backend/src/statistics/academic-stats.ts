import { Grade } from '../grades/grade.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { TeacherClassSubject } from '../teachers/teacher-class-subject.entity';
import { resolveBareme } from '../grades/grade-scale';

type PeriodBucket = { obtained: number; possible: number };

export type AssignmentPair = {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  room_id: string | null;
  room_name: string | null;
  teacher_id: number;
  teacher_name: string;
};

export type TeacherProfile = 'homeroom' | 'specialist' | 'mixed' | 'none' | 'school';

export type ClassThreshold = {
  min_average_admis: number;
  min_average_admis_ailleurs: number;
  min_average_redoubler: number;
  min_average_ajourne: number;
};

/** Même défaut que `class_decision_threshold` / onglet Notes. */
export const DEFAULT_CLASS_THRESHOLD: ClassThreshold = {
  min_average_admis: 10,
  min_average_admis_ailleurs: 8,
  min_average_redoubler: 6,
  min_average_ajourne: 4,
};

export type DecisionKind =
  | 'admis'
  | 'admis_ailleurs'
  | 'redoubler'
  | 'ajourne'
  | 'renvoye';

export type DecisionCounts = Record<DecisionKind, number>;

export function emptyDecisions(): DecisionCounts {
  return { admis: 0, admis_ailleurs: 0, redoubler: 0, ajourne: 0, renvoye: 0 };
}

export function decideAverage(avg: number, t: ClassThreshold): DecisionKind {
  if (avg >= t.min_average_admis) return 'admis';
  if (avg >= t.min_average_admis_ailleurs) return 'admis_ailleurs';
  if (avg >= t.min_average_redoubler) return 'redoubler';
  if (avg >= t.min_average_ajourne) return 'ajourne';
  return 'renvoye';
}

function resolveThreshold(
  classId: string | null | undefined,
  map: Record<string, ClassThreshold>,
): ClassThreshold {
  if (classId && map[classId]) return map[classId];
  return DEFAULT_CLASS_THRESHOLD;
}

function pickReferenceThreshold(
  classIds: string[],
  map: Record<string, ClassThreshold>,
): ClassThreshold {
  const counts = new Map<string, { t: ClassThreshold; n: number }>();
  for (const id of classIds) {
    const t = resolveThreshold(id, map);
    const k = [
      t.min_average_admis,
      t.min_average_admis_ailleurs,
      t.min_average_redoubler,
      t.min_average_ajourne,
    ].join('|');
    const cur = counts.get(k) ?? { t, n: 0 };
    cur.n += 1;
    counts.set(k, cur);
  }
  let best = DEFAULT_CLASS_THRESHOLD;
  let max = 0;
  for (const v of counts.values()) {
    if (v.n > max) {
      max = v.n;
      best = v.t;
    }
  }
  return best;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function averageFromBuckets(byPeriod: Map<string, PeriodBucket>): number | null {
  const avgs: number[] = [];
  for (const { obtained, possible } of byPeriod.values()) {
    if (possible > 0) avgs.push((obtained / possible) * 10);
  }
  if (avgs.length === 0) return null;
  return round2(avgs.reduce((a, b) => a + b, 0) / avgs.length);
}

export type HomeroomLink = {
  teacher_id: number;
  teacher_name: string;
  class_id: string;
};

function roomsCompatible(
  assignmentRoomId: string | null,
  studentRoomId: string | null | undefined,
): boolean {
  if (!assignmentRoomId) return true;
  if (!studentRoomId) return true;
  return assignmentRoomId === studentRoomId;
}

export function mapAssignment(a: TeacherClassSubject): AssignmentPair | null {
  const tid = Number(a.teacher_id ?? a.teacher?.id);
  const classId = a.class_id ?? a.class?.id;
  const subjectId = a.subject_id ?? a.subject?.id;
  if (!Number.isFinite(tid) || tid <= 0 || !classId || !subjectId) return null;
  const teacher = a.teacher;
  return {
    class_id: classId,
    class_name: a.class?.name ?? '—',
    subject_id: subjectId,
    subject_name: a.subject?.name ?? '—',
    room_id: a.room_id ?? a.room?.id ?? null,
    room_name: a.room?.name ?? null,
    teacher_id: tid,
    teacher_name: teacher
      ? `${teacher.first_name ?? ''} ${teacher.last_name ?? ''}`.trim() || teacher.email || '—'
      : '—',
  };
}

export function detectTeacherProfile(pairs: AssignmentPair[]): TeacherProfile {
  if (pairs.length === 0) return 'none';
  const classRooms = new Set(pairs.map((p) => `${p.class_id}|${p.room_id ?? ''}`));
  const subjects = new Set(pairs.map((p) => p.subject_id));
  if (classRooms.size <= 1 && subjects.size >= 3) return 'homeroom';
  if (subjects.size <= 2) return 'specialist';
  return 'mixed';
}

export function gradeMatchesPairs(
  classId: string,
  subjectId: string,
  studentRoomId: string | null,
  pairs: AssignmentPair[],
): boolean {
  return pairs.some(
    (p) =>
      p.class_id === classId &&
      p.subject_id === subjectId &&
      roomsCompatible(p.room_id, studentRoomId),
  );
}

export function studentInPairs(
  classId: string | null | undefined,
  roomId: string | null | undefined,
  pairs: AssignmentPair[],
): boolean {
  if (!classId) return false;
  return pairs.some(
    (p) => p.class_id === classId && roomsCompatible(p.room_id, roomId ?? null),
  );
}

export function studentLinkedToTeacher(
  classId: string | null | undefined,
  roomId: string | null | undefined,
  pairs: AssignmentPair[],
  homeroomClassIds: Set<string>,
): boolean {
  if (classId && homeroomClassIds.has(classId)) return true;
  return studentInPairs(classId, roomId, pairs);
}

export function gradeLinkedToTeacher(
  classId: string,
  subjectId: string,
  studentRoomId: string | null,
  pairs: AssignmentPair[],
  homeroomClassIds: Set<string>,
): boolean {
  if (homeroomClassIds.has(classId)) return true;
  return gradeMatchesPairs(classId, subjectId, studentRoomId, pairs);
}

export function computeAcademicPayload(input: {
  academicYearId: string | null;
  academicYearName: string | null;
  periodId: string | null;
  periodName: string | null;
  classes: Class[];
  students: Student[];
  grades: Grade[];
  allPairs: AssignmentPair[];
  scopePairs: AssignmentPair[] | null;
  homeroomLinks?: HomeroomLink[];
  classBaremeByKey?: Record<string, number>;
  teachersCount: number;
  viewerMode: 'admin' | 'teacher';
  profile: TeacherProfile;
  scopedTeacherId?: number;
  scopedTeacherName?: string | null;
  discipline: {
    absences: number;
    presents: number;
    latenesses: number;
    deductions_count: number;
    deductions_points: number;
    students_low_points: number;
  };
  thresholdsByClass?: Record<string, ClassThreshold>;
}) {
  const {
    students,
    grades,
    allPairs,
    scopePairs,
    classes,
  } = input;
  const thresholdsByClass = input.thresholdsByClass ?? {};
  const classBaremeByKey = input.classBaremeByKey ?? {};

  function gradeBareme(classId: string, subjectId: string, storedCoef: number, points: number): number {
    return resolveBareme({
      gradeCoefficient: storedCoef,
      classCoefficient: classBaremeByKey[`${classId}|${subjectId}`] ?? null,
      points,
    });
  }

  const studentBuckets = new Map<string, Map<string, PeriodBucket>>();
  const classStudentBuckets = new Map<string, Map<string, Map<string, PeriodBucket>>>();
  const subjectAgg = new Map<string, { name: string; obtained: number; possible: number; n: number }>();
  const classSubjectAgg = new Map<
    string,
    {
      class_id: string;
      class_name: string;
      room_id: string | null;
      room_name: string | null;
      subject_id: string;
      subject_name: string;
      obtained: number;
      possible: number;
      n: number;
      students: Set<string>;
    }
  >();

  const studentById = new Map(students.map((s) => [s.id, s]));

  for (const g of grades) {
    const sid = g.student?.id ?? (g as any).student_id;
    const cid = g.class?.id ?? (g as any).class_id;
    const subId = g.subject?.id ?? (g as any).subject_id;
    const pid = g.period?.id ?? (g as any).period_id;
    if (!sid || !cid || !subId || !pid) continue;
    const st = studentById.get(sid) ?? g.student;
    const roomId = st?.room?.id ?? (st as any)?.room_id ?? null;
    const roomName = st?.room?.name ?? null;
    const points = Number(g.grade_value) || 0;
    const coef = gradeBareme(cid, subId, Number(g.coefficient) || 0, points);

    if (!studentBuckets.has(sid)) studentBuckets.set(sid, new Map());
    const sb = studentBuckets.get(sid)!;
    const cur = sb.get(pid) ?? { obtained: 0, possible: 0 };
    cur.obtained += points;
    cur.possible += coef;
    sb.set(pid, cur);

    if (!classStudentBuckets.has(cid)) classStudentBuckets.set(cid, new Map());
    const cs = classStudentBuckets.get(cid)!;
    if (!cs.has(sid)) cs.set(sid, new Map());
    const csb = cs.get(sid)!;
    const ccur = csb.get(pid) ?? { obtained: 0, possible: 0 };
    ccur.obtained += points;
    ccur.possible += coef;
    csb.set(pid, ccur);

    const subName = g.subject?.name ?? '—';
    const sa = subjectAgg.get(subId) ?? { name: subName, obtained: 0, possible: 0, n: 0 };
    sa.obtained += points;
    sa.possible += coef;
    sa.n += 1;
    subjectAgg.set(subId, sa);

    const className = g.class?.name ?? st?.class?.name ?? '—';
    const csKey = `${cid}|${roomId ?? ''}|${subId}`;
    const csa = classSubjectAgg.get(csKey) ?? {
      class_id: cid,
      class_name: className,
      room_id: roomId,
      room_name: roomName,
      subject_id: subId,
      subject_name: subName,
      obtained: 0,
      possible: 0,
      n: 0,
      students: new Set<string>(),
    };
    csa.obtained += points;
    csa.possible += coef;
    csa.n += 1;
    csa.students.add(sid);
    classSubjectAgg.set(csKey, csa);
  }

  const studentAvgs: {
    id: string;
    name: string;
    class_id: string | null;
    class_name: string | null;
    room_id: string | null;
    room_name: string | null;
    average: number;
    decision: DecisionKind;
  }[] = [];

  for (const [sid, buckets] of studentBuckets) {
    const avg = averageFromBuckets(buckets);
    if (avg == null) continue;
    const st = studentById.get(sid);
    const classId = st?.class?.id ?? null;
    studentAvgs.push({
      id: sid,
      name: st ? `${st.first_name ?? ''} ${st.last_name ?? ''}`.trim() : '—',
      class_id: classId,
      class_name: st?.class?.name ?? null,
      room_id: st?.room?.id ?? null,
      room_name: st?.room?.name ?? null,
      average: avg,
      decision: decideAverage(avg, resolveThreshold(classId, thresholdsByClass)),
    });
  }
  studentAvgs.sort((a, b) => b.average - a.average);

  const allAvgs = studentAvgs.map((s) => s.average);
  const schoolAverage = allAvgs.length
    ? round2(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length)
    : null;

  const decisions = emptyDecisions();
  for (const s of studentAvgs) decisions[s.decision] += 1;
  const successCount = decisions.admis;
  const successRate = allAvgs.length ? round2((successCount / allAvgs.length) * 100) : null;

  const scopedClassIds = scopePairs
    ? new Set(scopePairs.map((p) => p.class_id))
    : new Set(classes.map((c) => c.id));

  const by_class = classes
    .filter((c) => scopedClassIds.has(c.id))
    .map((c) => {
      const cmap = classStudentBuckets.get(c.id);
      const avgs: number[] = [];
      if (cmap) {
        for (const buckets of cmap.values()) {
          const avg = averageFromBuckets(buckets);
          if (avg != null) avgs.push(avg);
        }
      }
      const studentsInClass = students.filter((s) => s.class?.id === c.id).length;
      const average = avgs.length ? round2(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
      const threshold = resolveThreshold(c.id, thresholdsByClass);
      const classDecisions = emptyDecisions();
      for (const a of avgs) classDecisions[decideAverage(a, threshold)] += 1;
      const success = avgs.length
        ? round2((classDecisions.admis / avgs.length) * 100)
        : null;
      return {
        class_id: c.id,
        class_name: c.name,
        level: c.level ?? null,
        students: studentsInClass,
        graded_students: avgs.length,
        average,
        success_rate: success,
        decisions: classDecisions,
        threshold,
      };
    })
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  const by_subject = [...subjectAgg.entries()]
    .map(([id, s]) => ({
      subject_id: id,
      subject_name: s.name,
      grades_count: s.n,
      average: s.possible > 0 ? round2((s.obtained / s.possible) * 10) : null,
    }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  const by_class_subject = [...classSubjectAgg.values()]
    .map((x) => ({
      class_id: x.class_id,
      class_name: x.class_name,
      room_id: x.room_id,
      room_name: x.room_name,
      subject_id: x.subject_id,
      subject_name: x.subject_name,
      grades_count: x.n,
      graded_students: x.students.size,
      average: x.possible > 0 ? round2((x.obtained / x.possible) * 10) : null,
    }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name, 'fr') || a.subject_name.localeCompare(b.subject_name, 'fr'));

  const teacherAcc = new Map<
    number,
    {
      name: string;
      assignments: number;
      studentBuckets: Map<string, Map<string, PeriodBucket>>;
      studentClass: Map<string, string | null>;
    }
  >();

  function ensureTeacher(id: number, name: string) {
    const cur = teacherAcc.get(id);
    if (cur) {
      if (cur.name === '—' && name !== '—') cur.name = name;
      return cur;
    }
    const created = {
      name,
      assignments: 0,
      studentBuckets: new Map<string, Map<string, PeriodBucket>>(),
      studentClass: new Map<string, string | null>(),
    };
    teacherAcc.set(id, created);
    return created;
  }

  const pairsForTeachers = (scopePairs ?? allPairs).filter((p) => scopedClassIds.has(p.class_id));
  const subjectClassIdsByTeacher = new Map<number, Set<string>>();
  for (const a of pairsForTeachers) {
    const t = ensureTeacher(a.teacher_id, a.teacher_name);
    t.assignments += 1;
    const classesTaught = subjectClassIdsByTeacher.get(a.teacher_id) ?? new Set<string>();
    classesTaught.add(a.class_id);
    subjectClassIdsByTeacher.set(a.teacher_id, classesTaught);
  }

  const homeroomOnlyByClass = new Map<string, { teacher_id: number; teacher_name: string }[]>();
  for (const h of input.homeroomLinks ?? []) {
    if (scopePairs && h.teacher_id !== input.scopedTeacherId) continue;
    if (!scopedClassIds.has(h.class_id)) continue;
    const taught = subjectClassIdsByTeacher.get(h.teacher_id);
    if (taught?.has(h.class_id)) continue;
    ensureTeacher(h.teacher_id, h.teacher_name).assignments += 1;
    const list = homeroomOnlyByClass.get(h.class_id) ?? [];
    list.push({ teacher_id: h.teacher_id, teacher_name: h.teacher_name });
    homeroomOnlyByClass.set(h.class_id, list);
  }

  const pairIndex = new Map<string, AssignmentPair[]>();
  for (const p of pairsForTeachers) {
    const k = `${p.class_id}|${p.subject_id}`;
    const list = pairIndex.get(k) ?? [];
    list.push(p);
    pairIndex.set(k, list);
  }

  for (const g of grades) {
    const sid = g.student?.id ?? (g as { student_id?: string }).student_id;
    const cid = g.class?.id ?? (g as { class_id?: string }).class_id;
    const subId = g.subject?.id ?? (g as { subject_id?: string }).subject_id;
    const pid = g.period?.id ?? (g as { period_id?: string }).period_id;
    if (!sid || !cid || !subId || !pid) continue;
    const st = studentById.get(sid) ?? g.student;
    const roomId = st?.room?.id ?? (st as { room_id?: string } | undefined)?.room_id ?? null;
    const points = Number(g.grade_value) || 0;
    const coef = gradeBareme(cid, subId, Number(g.coefficient) || 0, points);
    const matched = new Set<number>();
    for (const p of pairIndex.get(`${cid}|${subId}`) ?? []) {
      if (!roomsCompatible(p.room_id, roomId)) continue;
      matched.add(p.teacher_id);
    }
    for (const h of homeroomOnlyByClass.get(cid) ?? []) matched.add(h.teacher_id);
    for (const tid of matched) {
      const acc = teacherAcc.get(tid);
      if (!acc) continue;
      if (!acc.studentBuckets.has(sid)) acc.studentBuckets.set(sid, new Map());
      const sb = acc.studentBuckets.get(sid)!;
      const cur = sb.get(pid) ?? { obtained: 0, possible: 0 };
      cur.obtained += points;
      cur.possible += coef;
      sb.set(pid, cur);
      if (!acc.studentClass.has(sid)) {
        acc.studentClass.set(sid, st?.class?.id ?? cid);
      }
    }
  }

  const by_teacher = [...teacherAcc.entries()]
    .map(([id, t]) => {
      const avgs: { avg: number; class_id: string | null }[] = [];
      for (const [sid, buckets] of t.studentBuckets) {
        const avg = averageFromBuckets(buckets);
        if (avg == null) continue;
        avgs.push({ avg, class_id: t.studentClass.get(sid) ?? null });
      }
      const decisions = emptyDecisions();
      for (const row of avgs) {
        decisions[decideAverage(row.avg, resolveThreshold(row.class_id, thresholdsByClass))] += 1;
      }
      const average = avgs.length
        ? round2(avgs.reduce((s, r) => s + r.avg, 0) / avgs.length)
        : null;
      const success = avgs.length
        ? round2((decisions.admis / avgs.length) * 100)
        : null;
      return {
        teacher_id: id,
        teacher_name: t.name,
        assignments: t.assignments,
        graded_students: avgs.length,
        grades_count: 0,
        average,
        success_rate: success,
        decisions,
      };
    })
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  const bySubjectMap = new Map<
    string,
    {
      subject_id: string;
      subject_name: string;
      classes: { class_id: string; class_name: string; room_id: string | null; room_name: string | null; average: number | null }[];
    }
  >();
  for (const row of by_class_subject) {
    const cur = bySubjectMap.get(row.subject_id) ?? {
      subject_id: row.subject_id,
      subject_name: row.subject_name,
      classes: [],
    };
    cur.classes.push({
      class_id: row.class_id,
      class_name: row.class_name,
      room_id: row.room_id,
      room_name: row.room_name,
      average: row.average,
    });
    bySubjectMap.set(row.subject_id, cur);
  }
  const class_comparison_by_subject = [...bySubjectMap.values()].map((s) => {
    const ranked = [...s.classes].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
    const withAvg = ranked.filter((c) => c.average != null);
    return {
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      classes: ranked,
      strongest: withAvg[0] ?? null,
      weakest: withAvg.length ? withAvg[withAvg.length - 1] : null,
    };
  });

  const byClassMap = new Map<
    string,
    {
      class_id: string;
      class_name: string;
      room_id: string | null;
      room_name: string | null;
      subjects: { subject_id: string; subject_name: string; average: number | null }[];
    }
  >();
  for (const row of by_class_subject) {
    const key = `${row.class_id}|${row.room_id ?? ''}`;
    const cur = byClassMap.get(key) ?? {
      class_id: row.class_id,
      class_name: row.class_name,
      room_id: row.room_id,
      room_name: row.room_name,
      subjects: [],
    };
    cur.subjects.push({
      subject_id: row.subject_id,
      subject_name: row.subject_name,
      average: row.average,
    });
    byClassMap.set(key, cur);
  }
  const subject_comparison_by_class = [...byClassMap.values()].map((c) => {
    const ranked = [...c.subjects].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
    const withAvg = ranked.filter((s) => s.average != null);
    return {
      class_id: c.class_id,
      class_name: c.class_name,
      room_id: c.room_id,
      room_name: c.room_name,
      subjects: ranked,
      strongest: withAvg[0] ?? null,
      weakest: withAvg.length ? withAvg[withAvg.length - 1] : null,
    };
  });

  const insights = buildInsights({
    viewerMode: input.viewerMode,
    profile: input.profile,
    gradedCount: allAvgs.length,
  });
  const reference_threshold = pickReferenceThreshold(
    by_class.map((c) => c.class_id),
    thresholdsByClass,
  );

  const classOptions = classes
    .filter((c) => scopedClassIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  const subjectOptions = [
    ...new Map(
      (scopePairs ?? allPairs).map((p) => [p.subject_id, { id: p.subject_id, name: p.subject_name }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const teacherOptions = [
    ...new Map(
      allPairs.map((p) => [p.teacher_id, { id: p.teacher_id, name: p.teacher_name }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const roomOptions = [
    ...new Map(
      students
        .filter((s) => s.room?.id && scopedClassIds.has(s.class?.id ?? ''))
        .map((s) => [
          s.room!.id,
          { id: s.room!.id, name: s.room!.name, class_id: s.class?.id ?? null },
        ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return {
    academic_year_id: input.academicYearId,
    academic_year_name: input.academicYearName,
    period_id: input.periodId,
    period_name: input.periodName,
    viewer: {
      mode: input.viewerMode,
      profile: input.profile,
      teacher_id: input.scopedTeacherId ?? null,
      teacher_name: input.scopedTeacherName ?? null,
      assignments: (scopePairs ?? []).map((p) => ({
        class_id: p.class_id,
        class_name: p.class_name,
        subject_id: p.subject_id,
        subject_name: p.subject_name,
        room_id: p.room_id,
        room_name: p.room_name,
      })),
    },
    overview: {
      classes: by_class.length,
      students: students.length,
      teachers: input.viewerMode === 'teacher' ? 1 : input.teachersCount,
      grades: grades.length,
      graded_students: allAvgs.length,
      school_average: schoolAverage,
      success_rate: successRate,
      decisions,
      reference_threshold,
    },
    decisions,
    by_class,
    by_subject,
    by_teacher: input.viewerMode === 'teacher' ? [] : by_teacher,
    by_class_subject,
    class_comparison_by_subject,
    subject_comparison_by_class,
    top_students: studentAvgs.slice(0, 15),
    bottom_students: [...studentAvgs].reverse().slice(0, 15),
    discipline: input.discipline,
    insights,
    filter_options: {
      classes: classOptions,
      subjects: subjectOptions,
      teachers: input.viewerMode === 'teacher' ? [] : teacherOptions,
      rooms: roomOptions,
    },
  };
}

function buildInsights(args: {
  viewerMode: 'admin' | 'teacher';
  profile: TeacherProfile;
  gradedCount: number;
}): { headline: string; points: string[] } {
  if (args.profile === 'none') {
    return { headline: 'Bilan académique', points: [] };
  }
  if (args.gradedCount === 0) {
    return {
      headline:
        args.viewerMode === 'teacher'
          ? 'Bilan académique'
          : 'Bilan académique de l’école',
      points: [],
    };
  }
  const headline =
    args.viewerMode === 'teacher'
      ? args.profile === 'homeroom'
        ? 'Bilan académique de la classe'
        : args.profile === 'specialist'
          ? 'Bilan académique — vos matières'
          : 'Bilan académique'
      : 'Bilan académique de l’école';
  return { headline, points: [] };
}
