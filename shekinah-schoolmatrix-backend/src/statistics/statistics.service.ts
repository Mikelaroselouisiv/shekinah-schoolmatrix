import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grade } from '../grades/grade.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Period } from '../period/period.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { TeacherClassSubject } from '../teachers/teacher-class-subject.entity';
import { Attendance } from '../discipline/attendance.entity';
import { Lateness } from '../discipline/lateness.entity';
import { DisciplinaryDeduction } from '../discipline/disciplinary-deduction.entity';
import { FeeService } from '../economat/fee-service.entity';
import { ClassFee } from '../economat/class-fee.entity';
import { PaymentTransaction } from '../economat/payment-transaction.entity';
import { StudentServiceExemption } from '../economat/student-service-exemption.entity';
import { getCurrentAcademicYear } from '../economat/economat.service';
import { FinanceService } from '../finance/finance.service';

type PeriodBucket = { obtained: number; possible: number };

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
    @InjectRepository(Attendance) private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Lateness) private readonly latenessRepo: Repository<Lateness>,
    @InjectRepository(DisciplinaryDeduction)
    private readonly deductionRepo: Repository<DisciplinaryDeduction>,
    @InjectRepository(FeeService) private readonly feeServiceRepo: Repository<FeeService>,
    @InjectRepository(ClassFee) private readonly classFeeRepo: Repository<ClassFee>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(StudentServiceExemption)
    private readonly exemptionRepo: Repository<StudentServiceExemption>,
    private readonly financeService: FinanceService,
  ) {}

  async getAcademicStats(params: { academic_year_id?: string; period_id?: string }) {
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

    const [classes, students, teacherRole, grades] = await Promise.all([
      this.classRepo.find({ where: { active: true } as any, order: { name: 'ASC' } }),
      this.studentRepo.find({ where: { active: true }, relations: ['class'] }),
      this.roleRepo.findOne({ where: { name: 'TEACHER' } }),
      academicYearId
        ? this.gradeRepo
            .createQueryBuilder('g')
            .leftJoinAndSelect('g.student', 'student')
            .leftJoinAndSelect('g.class', 'class')
            .leftJoinAndSelect('g.subject', 'subject')
            .leftJoinAndSelect('g.period', 'period')
            .where('g.academic_year_id = :ay', { ay: academicYearId })
            .andWhere(periodId ? 'g.period_id = :pid' : '1=1', periodId ? { pid: periodId } : {})
            .getMany()
        : Promise.resolve([] as Grade[]),
    ]);

    let teachersCount = 0;
    if (teacherRole) {
      teachersCount = await this.userRepo.count({
        where: { role: { id: teacherRole.id }, active: true },
      });
    }

    // studentId -> periodId -> {obtained, possible}
    const studentBuckets = new Map<string, Map<string, PeriodBucket>>();
    // classId -> studentId -> buckets
    const classStudentBuckets = new Map<string, Map<string, Map<string, PeriodBucket>>>();
    // subjectId -> {name, obtained, possible, count}
    const subjectAgg = new Map<string, { name: string; obtained: number; possible: number; n: number }>();
    // classId|subjectId -> {obtained, possible, n}
    const classSubjectAgg = new Map<string, { obtained: number; possible: number; n: number }>();

    for (const g of grades) {
      const sid = g.student?.id ?? (g as any).student_id;
      const cid = g.class?.id ?? (g as any).class_id;
      const subId = g.subject?.id ?? (g as any).subject_id;
      const pid = g.period?.id ?? (g as any).period_id;
      if (!sid || !cid || !subId || !pid) continue;
      const coef = Number(g.coefficient) || 0;
      const points = Number(g.grade_value) || 0;

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

      const key = `${cid}|${subId}`;
      const csa = classSubjectAgg.get(key) ?? { obtained: 0, possible: 0, n: 0 };
      csa.obtained += points;
      csa.possible += coef;
      csa.n += 1;
      classSubjectAgg.set(key, csa);
    }

    const studentAvgs: { id: string; name: string; class_id: string | null; class_name: string | null; average: number }[] = [];
    const studentById = new Map(students.map((s) => [s.id, s]));

    for (const [sid, buckets] of studentBuckets) {
      const avg = averageFromBuckets(buckets);
      if (avg == null) continue;
      const st = studentById.get(sid);
      studentAvgs.push({
        id: sid,
        name: st ? `${st.first_name ?? ''} ${st.last_name ?? ''}`.trim() : '—',
        class_id: st?.class?.id ?? null,
        class_name: st?.class?.name ?? null,
        average: avg,
      });
    }
    studentAvgs.sort((a, b) => b.average - a.average);

    const allAvgs = studentAvgs.map((s) => s.average);
    const schoolAverage = allAvgs.length
      ? round2(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length)
      : null;
    const successCount = allAvgs.filter((a) => a >= 5).length;
    const successRate = allAvgs.length ? round2((successCount / allAvgs.length) * 100) : null;

    const distribution = {
      insuffisant: allAvgs.filter((a) => a < 5).length,
      passable: allAvgs.filter((a) => a >= 5 && a < 7).length,
      bien: allAvgs.filter((a) => a >= 7 && a < 8.5).length,
      excellent: allAvgs.filter((a) => a >= 8.5).length,
    };

    const by_class = classes.map((c) => {
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
      const success = avgs.length ? round2((avgs.filter((a) => a >= 5).length / avgs.length) * 100) : null;
      return {
        class_id: c.id,
        class_name: c.name,
        level: c.level ?? null,
        students: studentsInClass,
        graded_students: avgs.length,
        average,
        success_rate: success,
      };
    });

    const by_subject = [...subjectAgg.entries()]
      .map(([id, s]) => ({
        subject_id: id,
        subject_name: s.name,
        grades_count: s.n,
        average: s.possible > 0 ? round2((s.obtained / s.possible) * 10) : null,
      }))
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

    const assignments = await this.teacherClassSubjectRepo.find({
      relations: ['teacher', 'class', 'subject'],
    });
    const teacherAgg = new Map<
      number,
      { name: string; obtained: number; possible: number; assignments: number; grades: number }
    >();
    for (const a of assignments) {
      const tid = a.teacher_id ?? a.teacher?.id;
      if (!tid) continue;
      const name = a.teacher
        ? `${a.teacher.first_name ?? ''} ${a.teacher.last_name ?? ''}`.trim()
        : '—';
      const cur = teacherAgg.get(tid) ?? { name, obtained: 0, possible: 0, assignments: 0, grades: 0 };
      cur.assignments += 1;
      const key = `${a.class_id}|${a.subject_id}`;
      const csa = classSubjectAgg.get(key);
      if (csa) {
        cur.obtained += csa.obtained;
        cur.possible += csa.possible;
        cur.grades += csa.n;
      }
      teacherAgg.set(tid, cur);
    }
    const by_teacher = [...teacherAgg.entries()]
      .map(([id, t]) => ({
        teacher_id: id,
        teacher_name: t.name,
        assignments: t.assignments,
        grades_count: t.grades,
        average: t.possible > 0 ? round2((t.obtained / t.possible) * 10) : null,
      }))
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

    const [absences, presents, latenesses, deductionsSum, deductionsCount] = await Promise.all([
      this.attendanceRepo.count({ where: { status: 'ABSENT' } }),
      this.attendanceRepo.count({ where: { status: 'PRESENT' } }),
      this.latenessRepo.count(),
      this.deductionRepo
        .createQueryBuilder('d')
        .select('COALESCE(SUM(d.points_deducted), 0)', 's')
        .getRawOne()
        .then((r) => Number(r?.s ?? 0)),
      this.deductionRepo.count(),
    ]);

    return {
      academic_year_id: academicYearId ?? null,
      academic_year_name: academicYearName,
      period_id: periodId ?? null,
      period_name: periodName,
      overview: {
        classes: classes.length,
        students: students.length,
        teachers: teachersCount,
        grades: grades.length,
        graded_students: allAvgs.length,
        school_average: schoolAverage,
        success_rate: successRate,
      },
      distribution,
      by_class,
      by_subject,
      by_teacher,
      top_students: studentAvgs.slice(0, 15),
      bottom_students: [...studentAvgs].reverse().slice(0, 15),
      discipline: {
        absences,
        presents,
        latenesses,
        deductions_count: deductionsCount,
        deductions_points: deductionsSum,
      },
    };
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
