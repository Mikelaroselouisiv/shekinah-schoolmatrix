import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Grade } from '../grades/grade.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Period } from '../period/period.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { TeacherClassSubject } from '../teachers/teacher-class-subject.entity';
import { ClassTeacher } from '../teachers/class-teacher.entity';
import { Attendance } from '../discipline/attendance.entity';
import { Lateness } from '../discipline/lateness.entity';
import { DisciplinaryDeduction } from '../discipline/disciplinary-deduction.entity';
import { ClassDecisionThreshold } from '../formation-classe/class-decision-threshold.entity';
import { ClassSubjectCoefficient } from '../grades/class-subject-coefficient.entity';
import { FeeService } from '../economat/fee-service.entity';
import { ClassFee } from '../economat/class-fee.entity';
import { PaymentTransaction } from '../economat/payment-transaction.entity';
import { StudentServiceExemption } from '../economat/student-service-exemption.entity';
import { getCurrentAcademicYear } from '../economat/economat.service';
import { FinanceService } from '../finance/finance.service';
import { isTeacherRoleName, TEACHER_ROLE_NAMES } from '../roles/roles.constants';
import { LevelScopeService } from '../auth/level-scope.service';
import {
  computeAcademicPayload,
  detectTeacherProfile,
  gradeLinkedToTeacher,
  mapAssignment,
  studentLinkedToTeacher,
  type AssignmentPair,
  type ClassThreshold,
  type HomeroomLink,
} from './academic-stats';

export type AcademicStatsViewer = {
  userId?: number;
  role?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(Grade) private readonly gradeRepo: Repository<Grade>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(Class) private readonly classRepo: Repository<Class>,
    @InjectRepository(AcademicYear) private readonly academicYearRepo: Repository<AcademicYear>,
    @InjectRepository(Period) private readonly periodRepo: Repository<Period>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(TeacherClassSubject)
    private readonly teacherClassSubjectRepo: Repository<TeacherClassSubject>,
    @InjectRepository(ClassTeacher)
    private readonly classTeacherRepo: Repository<ClassTeacher>,
    @InjectRepository(Attendance) private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Lateness) private readonly latenessRepo: Repository<Lateness>,
    @InjectRepository(DisciplinaryDeduction)
    private readonly deductionRepo: Repository<DisciplinaryDeduction>,
    @InjectRepository(ClassDecisionThreshold)
    private readonly thresholdRepo: Repository<ClassDecisionThreshold>,
    @InjectRepository(ClassSubjectCoefficient)
    private readonly coefRepo: Repository<ClassSubjectCoefficient>,
    @InjectRepository(FeeService) private readonly feeServiceRepo: Repository<FeeService>,
    @InjectRepository(ClassFee) private readonly classFeeRepo: Repository<ClassFee>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(StudentServiceExemption)
    private readonly exemptionRepo: Repository<StudentServiceExemption>,
    private readonly financeService: FinanceService,
    private readonly levelScope: LevelScopeService,
  ) {}

  async getAcademicStats(params: {
    academic_year_id?: string;
    period_id?: string;
    class_id?: string;
    subject_id?: string;
    teacher_id?: number;
    room_id?: string;
    viewer?: AcademicStatsViewer;
  }) {
    let academicYearId = params.academic_year_id;
    let academicYearName: string | null = null;
    if (academicYearId) {
      const ay = await this.academicYearRepo.findOne({ where: { id: academicYearId } });
      academicYearName = ay?.name ?? null;
    } else {
      const current = await this.academicYearRepo.find({ order: { name: 'DESC' }, take: 1 });
      academicYearId = current[0]?.id;
      academicYearName = current[0]?.name ?? null;
    }

    const periodId = params.period_id || undefined;
    let periodName: string | null = null;
    if (periodId) {
      const p = await this.periodRepo.findOne({ where: { id: periodId } });
      periodName = p?.name ?? null;
    }

    const isTeacher = isTeacherRoleName(params.viewer?.role);
    const scopedTeacherId = isTeacher
      ? params.viewer?.userId
      : params.teacher_id || undefined;

    let [classes, studentsAll, teacherRoles, gradesAll, rawAssignments, thresholdRows, classTeachers, coefRows] =
      await Promise.all([
        this.classRepo.find({ where: { active: true } as any, order: { name: 'ASC' } }),
        this.studentRepo.find({ where: { active: true }, relations: ['class', 'room'] }),
        this.roleRepo.find({ where: { name: In(TEACHER_ROLE_NAMES) } }),
        academicYearId
          ? this.gradeRepo
              .createQueryBuilder('g')
              .leftJoinAndSelect('g.student', 'student')
              .leftJoinAndSelect('student.room', 'studentRoom')
              .leftJoinAndSelect('g.class', 'class')
              .leftJoinAndSelect('g.subject', 'subject')
              .leftJoinAndSelect('g.period', 'period')
              .where('g.academic_year_id = :ay', { ay: academicYearId })
              .andWhere(periodId ? 'g.period_id = :pid' : '1=1', periodId ? { pid: periodId } : {})
              .getMany()
          : Promise.resolve([] as Grade[]),
        this.teacherClassSubjectRepo.find({
          relations: ['teacher', 'class', 'subject', 'room'],
        }),
        academicYearId
          ? this.thresholdRepo.find({
              where: { academic_year: { id: academicYearId } },
              relations: ['class'],
            })
          : Promise.resolve([] as ClassDecisionThreshold[]),
        this.classTeacherRepo.find({
          relations: ['teacher', 'class'],
        }),
        academicYearId
          ? this.coefRepo.find({
              where: { academic_year: { id: academicYearId } },
              relations: ['class', 'subject'],
            })
          : Promise.resolve([] as ClassSubjectCoefficient[]),
      ]);

    if (!isTeacher) {
      const ls = await this.levelScope.resolve(params.viewer);
      if (ls.kind === 'restricted') {
        const idSet = new Set(ls.classIds);
        classes = classes.filter(
          (c) => idSet.has(c.id) || (c.level != null && ls.levels.includes(c.level)),
        );
        studentsAll = studentsAll.filter((s) => s.class?.id && idSet.has(s.class.id));
        gradesAll = gradesAll.filter((g) => {
          const cid = g.class?.id ?? (g as { class_id?: string }).class_id;
          return !!cid && idSet.has(cid);
        });
      }
    }

    let teachersCount = 0;
    if (teacherRoles.length > 0) {
      teachersCount = await this.userRepo.count({
        where: { role: { id: In(teacherRoles.map((r) => r.id)) }, active: true },
      });
    }

    const allPairs = rawAssignments
      .map(mapAssignment)
      .filter((p): p is AssignmentPair => !!p);

    const teacherPairs = scopedTeacherId
      ? allPairs.filter((p) => Number(p.teacher_id) === Number(scopedTeacherId))
      : allPairs;

    const homeroomLinks: HomeroomLink[] = classTeachers
      .map((ct) => {
        const tid = Number(ct.user_id ?? ct.teacher?.id);
        const cid = ct.class_id ?? ct.class?.id;
        if (!Number.isFinite(tid) || tid <= 0 || !cid) return null;
        const teacher = ct.teacher;
        return {
          teacher_id: tid,
          class_id: cid,
          teacher_name: teacher
            ? `${teacher.first_name ?? ''} ${teacher.last_name ?? ''}`.trim() ||
              teacher.email ||
              '—'
            : '—',
        };
      })
      .filter((h): h is HomeroomLink => !!h);

    const subjectClassIds = new Set(teacherPairs.map((p) => p.class_id));
    const homeroomOnlyClassIds = new Set(
      homeroomLinks
        .filter((h) => !scopedTeacherId || Number(h.teacher_id) === Number(scopedTeacherId))
        .filter((h) => !subjectClassIds.has(h.class_id))
        .filter((h) => !params.class_id || h.class_id === params.class_id)
        .map((h) => h.class_id),
    );

    const viewerMode: 'admin' | 'teacher' = isTeacher ? 'teacher' : 'admin';
    const profile = scopedTeacherId
      ? teacherPairs.length > 0
        ? detectTeacherProfile(teacherPairs)
        : homeroomOnlyClassIds.size > 0
          ? 'homeroom'
          : 'none'
      : ('school' as const);

    let scopePairs: AssignmentPair[] | null = scopedTeacherId ? teacherPairs : null;
    if (scopePairs) {
      if (params.class_id) {
        scopePairs = scopePairs.filter((p) => p.class_id === params.class_id);
      }
      if (params.subject_id) {
        scopePairs = scopePairs.filter((p) => p.subject_id === params.subject_id);
      }
      if (params.room_id) {
        scopePairs = scopePairs.filter((p) => !p.room_id || p.room_id === params.room_id);
      }
    }

    let classesScoped = classes;
    if (params.class_id) {
      classesScoped = classes.filter((c) => c.id === params.class_id);
    }

    let students = studentsAll;
    if (params.class_id) {
      students = students.filter((s) => s.class?.id === params.class_id);
    }
    if (params.room_id) {
      students = students.filter((s) => s.room?.id === params.room_id);
    }
    if (scopedTeacherId) {
      students = students.filter((s) =>
        studentLinkedToTeacher(
          s.class?.id,
          s.room?.id ?? null,
          scopePairs ?? [],
          homeroomOnlyClassIds,
        ),
      );
    }

    const studentIds = new Set(students.map((s) => s.id));
    let grades = gradesAll.filter((g) => {
      const sid = g.student?.id ?? (g as { student_id?: string }).student_id;
      const cid = g.class?.id ?? (g as { class_id?: string }).class_id;
      const subId = g.subject?.id ?? (g as { subject_id?: string }).subject_id;
      if (!sid || !cid || !subId) return false;
      if (!studentIds.has(sid)) return false;
      if (params.class_id && cid !== params.class_id) return false;
      if (params.subject_id && subId !== params.subject_id) return false;
      const roomId = g.student?.room?.id ?? null;
      if (params.room_id && roomId !== params.room_id) return false;
      if (
        scopedTeacherId &&
        !gradeLinkedToTeacher(cid, subId, roomId, scopePairs ?? [], homeroomOnlyClassIds)
      ) {
        return false;
      }
      return true;
    });

    const ids = [...studentIds];
    const emptyDiscipline = {
      absences: 0,
      presents: 0,
      latenesses: 0,
      deductions_count: 0,
      deductions_points: 0,
      students_low_points: 0,
    };

    let discipline = emptyDiscipline;
    if (ids.length > 0) {
      const [absences, presents, latenesses, deductionsSum, deductionsCount, deductionRows] =
        await Promise.all([
          this.attendanceRepo.count({ where: { student: { id: In(ids) }, status: 'ABSENT' } }),
          this.attendanceRepo.count({ where: { student: { id: In(ids) }, status: 'PRESENT' } }),
          this.latenessRepo.count({ where: { student: { id: In(ids) } } }),
          this.deductionRepo
            .createQueryBuilder('d')
            .leftJoin('d.student', 'st')
            .select('COALESCE(SUM(d.points_deducted), 0)', 's')
            .where('st.id IN (:...ids)', { ids })
            .getRawOne()
            .then((r) => Number(r?.s ?? 0)),
          this.deductionRepo
            .createQueryBuilder('d')
            .leftJoin('d.student', 'st')
            .where('st.id IN (:...ids)', { ids })
            .getCount(),
          this.deductionRepo
            .createQueryBuilder('d')
            .leftJoin('d.student', 'st')
            .select('st.id', 'sid')
            .addSelect('COALESCE(SUM(d.points_deducted), 0)', 'pts')
            .where('st.id IN (:...ids)', { ids })
            .groupBy('st.id')
            .getRawMany(),
        ]);
      const studentsLow = deductionRows.filter((r) => 100 - Number(r.pts ?? 0) < 70).length;
      discipline = {
        absences,
        presents,
        latenesses,
        deductions_count: deductionsCount,
        deductions_points: deductionsSum,
        students_low_points: studentsLow,
      };
    }

    const scopedTeacherName = scopedTeacherId
      ? teacherPairs[0]?.teacher_name ??
        homeroomLinks.find((h) => Number(h.teacher_id) === Number(scopedTeacherId))
          ?.teacher_name ??
        allPairs.find((p) => Number(p.teacher_id) === Number(scopedTeacherId))?.teacher_name ??
        null
      : null;

    const thresholdsByClass: Record<string, ClassThreshold> = {};
    for (const t of thresholdRows) {
      const cid = t.class?.id ?? (t as { class_id?: string }).class_id;
      if (!cid) continue;
      thresholdsByClass[cid] = {
        min_average_admis: Number(t.min_average_admis),
        min_average_admis_ailleurs: Number(t.min_average_admis_ailleurs),
        min_average_redoubler: Number(t.min_average_redoubler),
        min_average_ajourne: Number(t.min_average_ajourne),
      };
    }

    const classBaremeByKey: Record<string, number> = {};
    for (const c of coefRows) {
      const cid = c.class?.id ?? (c as { class_id?: string }).class_id;
      const sid = c.subject?.id ?? (c as { subject_id?: string }).subject_id;
      if (!cid || !sid) continue;
      classBaremeByKey[`${cid}|${sid}`] = Number(c.coefficient);
    }

    return computeAcademicPayload({
      academicYearId: academicYearId ?? null,
      academicYearName,
      periodId: periodId ?? null,
      periodName,
      classes: classesScoped,
      students,
      grades,
      allPairs,
      scopePairs,
      homeroomLinks,
      classBaremeByKey,
      teachersCount,
      viewerMode,
      profile,
      scopedTeacherId,
      scopedTeacherName,
      discipline,
      thresholdsByClass,
    });
  }

  async getFinancialStats(params: {
    academic_year?: string;
    date_from?: string;
    date_to?: string;
  }) {
    const academicYear = params.academic_year || getCurrentAcademicYear();
    const now = new Date();
    const dateFrom =
      params.date_from ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const dateTo = params.date_to || now.toISOString().slice(0, 10);

    const [students, classFees, transactions, exemptions, services, classes, monitor, banks] =
      await Promise.all([
        this.studentRepo.find({ where: { active: true }, relations: ['class'] }),
        this.classFeeRepo.find({
          where: { academic_year: academicYear },
          relations: ['class', 'service'],
        }),
        this.transactionRepo.find({
          where: { academic_year: academicYear },
          relations: ['student', 'class', 'service'],
        }),
        this.exemptionRepo.find({
          where: { academic_year: academicYear },
          relations: ['student', 'service'],
        }),
        this.feeServiceRepo.find({ order: { name: 'ASC' } }),
        this.classRepo.find({ where: { active: true } as any, order: { name: 'ASC' } }),
        this.financeService.getMonitorStats({
          date_from: dateFrom,
          date_to: dateTo,
        }),
        this.financeService.getBankAccountsMonitor(),
      ]);

    const feeByClassService = new Map<string, number>();
    for (const cf of classFees) {
      const cid = cf.class?.id ?? (cf as any).class_id;
      const sid = cf.service?.id ?? (cf as any).service_id;
      if (!cid || !sid) continue;
      feeByClassService.set(`${cid}|${sid}`, Number(cf.amount) || 0);
    }

    const exemptionMap = new Map<string, string>();
    for (const e of exemptions) {
      const sid = e.student?.id ?? (e as any).student_id;
      const svc = e.service?.id ?? (e as any).service_id;
      if (sid && svc) exemptionMap.set(`${sid}|${svc}`, e.exemption_type);
    }

    const paidByStudentService = new Map<string, number>();
    const paidByClass = new Map<string, number>();
    const paidByService = new Map<string, number>();
    const monthly = new Map<string, number>();

    for (const t of transactions) {
      const stId = t.student?.id ?? (t as any).student_id;
      const svcId = t.service?.id ?? (t as any).service_id;
      const cid = t.class?.id ?? (t as any).class_id;
      const paid = Number(t.amount_paid) || 0;
      if (stId && svcId) {
        const k = `${stId}|${svcId}`;
        paidByStudentService.set(k, (paidByStudentService.get(k) ?? 0) + paid);
      }
      if (cid) paidByClass.set(cid, (paidByClass.get(cid) ?? 0) + paid);
      if (svcId) paidByService.set(svcId, (paidByService.get(svcId) ?? 0) + paid);
      const rawDate = t.payment_date as Date | string | null;
      const d = rawDate
        ? (typeof rawDate === 'string' ? rawDate : rawDate.toISOString()).slice(0, 7)
        : null;
      if (d) monthly.set(d, (monthly.get(d) ?? 0) + paid);
    }

    const serviceIds = [...new Set(classFees.map((cf) => cf.service?.id).filter(Boolean))] as string[];

    let totalDue = 0;
    let totalPaid = 0;
    const dueByClass = new Map<string, number>();
    const dueByService = new Map<string, number>();
    let studentsWithBalance = 0;
    let studentsFullyPaid = 0;
    const studentBalances: {
      student_id: string;
      student_name: string;
      class_id: string | null;
      class_name: string | null;
      amount_due: number;
      amount_paid: number;
      balance: number;
    }[] = [];

    for (const st of students) {
      const cid = st.class?.id;
      if (!cid) continue;
      let stuDue = 0;
      let stuPaid = 0;
      for (const svcId of serviceIds) {
        const base = feeByClassService.get(`${cid}|${svcId}`);
        if (base == null) continue;
        const ex = exemptionMap.get(`${st.id}|${svcId}`);
        let due = base;
        if (ex === 'FULL') due = 0;
        else if (ex === 'HALF') due = round2(base * 0.5);
        const paid = paidByStudentService.get(`${st.id}|${svcId}`) ?? 0;
        stuDue += due;
        stuPaid += paid;
        totalDue += due;
        totalPaid += paid;
        dueByClass.set(cid, (dueByClass.get(cid) ?? 0) + due);
        dueByService.set(svcId, (dueByService.get(svcId) ?? 0) + due);
      }
      stuDue = round2(stuDue);
      stuPaid = round2(stuPaid);
      if (stuDue > 0) {
        if (stuPaid >= stuDue - 0.01) studentsFullyPaid += 1;
        else studentsWithBalance += 1;
      }
      if (stuDue > 0 || stuPaid > 0) {
        studentBalances.push({
          student_id: st.id,
          student_name: `${st.first_name ?? ''} ${st.last_name ?? ''}`.trim(),
          class_id: cid,
          class_name: st.class?.name ?? null,
          amount_due: stuDue,
          amount_paid: stuPaid,
          balance: round2(stuDue - stuPaid),
        });
      }
    }

    totalDue = round2(totalDue);
    totalPaid = round2(totalPaid);
    const collectionRate = totalDue > 0 ? round2((totalPaid / totalDue) * 100) : null;

    const by_class = classes.map((c) => {
      const due = round2(dueByClass.get(c.id) ?? 0);
      const paid = round2(paidByClass.get(c.id) ?? 0);
      const studentsInClass = students.filter((s) => s.class?.id === c.id).length;
      return {
        class_id: c.id,
        class_name: c.name,
        students: studentsInClass,
        amount_due: due,
        amount_paid: paid,
        balance: round2(due - paid),
        collection_rate: due > 0 ? round2((paid / due) * 100) : null,
      };
    });

    const serviceName = new Map(services.map((s) => [s.id, s.name]));
    const by_service = serviceIds.map((id) => {
      const due = round2(dueByService.get(id) ?? 0);
      const paid = round2(paidByService.get(id) ?? 0);
      return {
        service_id: id,
        service_name: serviceName.get(id) ?? '—',
        amount_due: due,
        amount_paid: paid,
        balance: round2(due - paid),
        collection_rate: due > 0 ? round2((paid / due) * 100) : null,
      };
    });

    const debtors = studentBalances
      .filter((s) => s.balance > 0.01)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 20);

    const by_month = [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: round2(amount) }));

    return {
      academic_year: academicYear,
      date_from: dateFrom,
      date_to: dateTo,
      overview: {
        amount_due: totalDue,
        amount_paid: totalPaid,
        balance: round2(totalDue - totalPaid),
        collection_rate: collectionRate,
        students_total: students.length,
        students_with_balance: studentsWithBalance,
        students_fully_paid: studentsFullyPaid,
        transactions_count: transactions.length,
      },
      cashflow: monitor,
      banks,
      by_class,
      by_service,
      by_month,
      top_debtors: debtors,
    };
  }
}
