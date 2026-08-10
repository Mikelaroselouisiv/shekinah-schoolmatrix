import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassSubjectCoefficient } from './class-subject-coefficient.entity';
import { Grade } from './grade.entity';
import { Student } from '../students/student.entity';
import { ScheduleSlot } from '../teachers/schedule-slot.entity';
import { Period } from '../period/period.entity';

@Injectable()
export class GradesService {
  constructor(
    @InjectRepository(ClassSubjectCoefficient)
    private readonly coefRepo: Repository<ClassSubjectCoefficient>,
    @InjectRepository(Grade)
    private readonly gradeRepo: Repository<Grade>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(ScheduleSlot)
    private readonly scheduleSlotRepo: Repository<ScheduleSlot>,
    @InjectRepository(Period)
    private readonly periodRepo: Repository<Period>,
  ) {}

  async getTeacherForClassSubject(classId: string, subjectId: string): Promise<{ id: number; name: string } | null> {
    const slot = await this.scheduleSlotRepo.findOne({
      where: { class: { id: classId }, subject: { id: subjectId } },
      relations: ['teacher'],
    });
    if (!slot?.teacher) return null;
    const t = slot.teacher;
    return {
      id: t.id,
      name: [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email,
    };
  }

  async findAllCoefficients(filters: { academic_year_id?: string; class_id?: string }): Promise<any[]> {
    const qb = this.coefRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.academic_year', 'ay')
      .leftJoinAndSelect('c.class', 'class')
      .leftJoinAndSelect('c.subject', 'subject')
      .orderBy('ay.name', 'DESC')
      .addOrderBy('class.name', 'ASC')
      .addOrderBy('subject.name', 'ASC');
    if (filters.academic_year_id) qb.andWhere('c.academic_year_id = :ay', { ay: filters.academic_year_id });
    if (filters.class_id) qb.andWhere('c.class_id = :c', { c: filters.class_id });
    const list = await qb.getMany();
    return list.map((c) => ({
      id: c.id,
      academic_year_id: c.academic_year?.id,
      academic_year_name: c.academic_year?.name,
      class_id: c.class?.id,
      class_name: c.class?.name,
      subject_id: c.subject?.id,
      subject_name: c.subject?.name,
      coefficient: Number(c.coefficient),
      created_at: c.created_at,
    }));
  }

  async getCoefficient(academicYearId: string, classId: string, subjectId: string, _periodId?: string): Promise<number | null> {
    const c = await this.coefRepo.findOne({
      where: {
        academic_year: { id: academicYearId },
        class: { id: classId },
        subject: { id: subjectId },
      },
    });
    return c ? Number(c.coefficient) : null;
  }

  async setCoefficient(params: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    coefficient: number;
  }): Promise<ClassSubjectCoefficient> {
    let c = await this.coefRepo.findOne({
      where: {
        academic_year: { id: params.academic_year_id },
        class: { id: params.class_id },
        subject: { id: params.subject_id },
      },
      relations: ['academic_year', 'class', 'subject'],
    });
    if (c) {
      c.coefficient = String(params.coefficient);
      return this.coefRepo.save(c);
    }
    c = this.coefRepo.create({
      academic_year: { id: params.academic_year_id },
      class: { id: params.class_id },
      subject: { id: params.subject_id },
      coefficient: String(params.coefficient),
    });
    return this.coefRepo.save(c);
  }

  async getGradesFormData(params: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    period_id: string;
  }): Promise<any> {
    const students = await this.studentRepo.find({
      where: { class: { id: params.class_id } },
      relations: ['class'],
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
    const defaultCoef = await this.getCoefficient(params.academic_year_id, params.class_id, params.subject_id, params.period_id);
    const existingGrades = await this.gradeRepo.find({
      where: {
        academic_year: { id: params.academic_year_id },
        class: { id: params.class_id },
        subject: { id: params.subject_id },
        period: { id: params.period_id },
      },
      relations: ['student'],
    });
    const gradeByStudent: Record<string, { id: string; coefficient: number; grade_value: number; detail?: string }> = {};
    for (const g of existingGrades) {
      const sid = g.student?.id ?? (g as any).studentId;
      if (sid) gradeByStudent[sid] = {
        id: g.id,
        coefficient: Number(g.coefficient),
        grade_value: Number(g.grade_value),
        detail: g.detail ?? undefined,
      };
    }
    const teacher = await this.getTeacherForClassSubject(params.class_id, params.subject_id);
    const rows = students.map((s) => {
      const existing = gradeByStudent[s.id];
      return {
        student_id: s.id,
        student_name: `${s.first_name} ${s.last_name}`,
        coefficient: existing?.coefficient ?? defaultCoef ?? 0,
        grade_value: existing?.grade_value ?? null,
        detail: existing?.detail ?? '',
        grade_id: existing?.id ?? null,
      };
    });
    return { teacher, default_coefficient: defaultCoef, rows };
  }

  async hasExistingGrades(params: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    period_id: string;
  }): Promise<boolean> {
    const count = await this.gradeRepo.count({
      where: {
        academic_year: { id: params.academic_year_id },
        class: { id: params.class_id },
        subject: { id: params.subject_id },
        period: { id: params.period_id },
      },
    });
    return count > 0;
  }

  async saveGrades(params: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    period_id: string;
    grades: { student_id: string; coefficient: number; grade_value: number | null; detail?: string }[];
  }): Promise<{ ok: boolean }> {
    for (const g of params.grades) {
      const existing = await this.gradeRepo.findOne({
        where: {
          student: { id: g.student_id },
          academic_year: { id: params.academic_year_id },
          subject: { id: params.subject_id },
          period: { id: params.period_id },
        },
        relations: ['student', 'academic_year', 'class', 'subject', 'period'],
      });
      const student = await this.studentRepo.findOne({ where: { id: g.student_id }, relations: ['class'] });
      if (!student) throw new BadRequestException(`Élève ${g.student_id} introuvable.`);
      const coefficient = String(g.coefficient);
      const grade_value = g.grade_value == null ? '0' : String(g.grade_value);
      if (existing) {
        existing.coefficient = coefficient;
        existing.grade_value = grade_value;
        existing.detail = g.detail?.trim() || undefined;
        await this.gradeRepo.save(existing);
      } else {
        if (g.grade_value == null && !g.detail?.trim()) continue;
        const newGrade = this.gradeRepo.create({
          student: { id: g.student_id },
          academic_year: { id: params.academic_year_id },
          class: { id: params.class_id },
          subject: { id: params.subject_id },
          period: { id: params.period_id },
          coefficient,
          grade_value,
          detail: g.detail?.trim(),
        });
        await this.gradeRepo.save(newGrade);
      }
    }
    return { ok: true };
  }

  async findGrades(filters: {
    academic_year_id?: string;
    class_id?: string;
    subject_id?: string;
    period_id?: string;
    student_id?: string;
  }): Promise<any[]> {
    const qb = this.gradeRepo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.student', 'student')
      .leftJoinAndSelect('g.class', 'class')
      .leftJoinAndSelect('g.subject', 'subject')
      .leftJoinAndSelect('g.period', 'period')
      .leftJoinAndSelect('g.academic_year', 'ay')
      .orderBy('ay.name', 'DESC')
      .addOrderBy('class.name', 'ASC')
      .addOrderBy('subject.name', 'ASC')
      .addOrderBy('period.order_index', 'ASC')
      .addOrderBy('student.last_name', 'ASC');
    if (filters.academic_year_id) qb.andWhere('g.academic_year_id = :ay', { ay: filters.academic_year_id });
    if (filters.class_id) qb.andWhere('g.class_id = :c', { c: filters.class_id });
    if (filters.subject_id) qb.andWhere('g.subject_id = :s', { s: filters.subject_id });
    if (filters.period_id) qb.andWhere('g.period_id = :p', { p: filters.period_id });
    if (filters.student_id) qb.andWhere('g.student_id = :sid', { sid: filters.student_id });
    const list = await qb.getMany();
    return list.map((g) => ({
      id: g.id,
      student_id: g.student?.id,
      student_name: g.student ? `${g.student.first_name} ${g.student.last_name}` : null,
      academic_year_id: g.academic_year?.id,
      academic_year_name: g.academic_year?.name,
      class_id: g.class?.id,
      class_name: g.class?.name,
      subject_id: g.subject?.id,
      subject_name: g.subject?.name,
      period_id: g.period?.id,
      period_name: g.period?.name,
      coefficient: Number(g.coefficient),
      grade_value: Number(g.grade_value),
      detail: g.detail,
      created_at: g.created_at,
      updated_at: g.updated_at,
    }));
  }

  async getStudentExamResults(studentId: string, academicYearId: string): Promise<any> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class'],
    });
    if (!student) throw new NotFoundException('Student not found');
    const classId = student.class?.id;
    if (!classId) return { periods: [], subjects: [], academic_year_name: null };

    const [periods, coefficients, grades] = await Promise.all([
      this.periodRepo.find({
        where: { academic_year: { id: academicYearId } },
        relations: ['academic_year'],
        order: { order_index: 'ASC', name: 'ASC' },
      }),
      this.coefRepo.find({
        where: { academic_year: { id: academicYearId }, class: { id: classId } },
        relations: ['subject'],
      }),
      this.gradeRepo
        .createQueryBuilder('g')
        .leftJoinAndSelect('g.subject', 'subject')
        .leftJoinAndSelect('g.period', 'period')
        .where('g.student_id = :studentId', { studentId })
        .andWhere('g.academic_year_id = :academicYearId', { academicYearId })
        .getMany(),
    ]);

    const coefBySubject = new Map<string, { subjectName: string; coefficient: number }>();
    for (const c of coefficients) {
      const sid = String(c.subject?.id ?? (c as any).subject_id ?? '');
      if (sid) coefBySubject.set(sid, { subjectName: (c.subject as any)?.name ?? '—', coefficient: Number(c.coefficient) });
    }

    const subjectMap = new Map<string, { subject_id: string; subject_name: string; periods: any[] }>();

    for (const g of grades) {
      const sid = String((g as any).subject_id ?? g.subject?.id ?? '');
      const pid = (g as any).period_id ?? g.period?.id;
      if (!sid || !pid) continue;
      const subjName = (g.subject as any)?.name ?? coefBySubject.get(sid)?.subjectName ?? '—';
      const coef = (Number(g.coefficient) || coefBySubject.get(sid)?.coefficient) ?? 0;
      const val = Number(g.grade_value) || 0;
      const period = g.period as any;
      const orderIndex = period?.order_index ?? 0;
      const periodName = period?.name ?? '—';

      if (!subjectMap.has(sid)) {
        subjectMap.set(sid, { subject_id: sid, subject_name: subjName, periods: [] });
      }
      const sub = subjectMap.get(sid)!;
      if (!sub.periods.some((pe: any) => pe.period_id === pid)) {
        sub.periods.push({
          period_id: pid,
          period_name: periodName,
          order_index: orderIndex,
          coefficient: coef,
          grade_value: val,
        });
      }
    }

    for (const sub of subjectMap.values()) {
      const existingPids = new Set(sub.periods.map((pe: any) => String(pe.period_id)));
      for (const p of periods) {
        const pid = String(p.id);
        if (existingPids.has(pid)) continue;
        sub.periods.push({
          period_id: p.id,
          period_name: p.name ?? '—',
          order_index: p.order_index ?? 0,
          coefficient: coefBySubject.get(sub.subject_id)?.coefficient ?? 0,
          grade_value: 0,
        });
      }
      sub.periods.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
    }

    for (const [sid, { subjectName, coefficient }] of coefBySubject) {
      if (subjectMap.has(sid)) continue;
      const sub = { subject_id: sid, subject_name: subjectName, periods: [] as any[] };
      for (const p of periods) {
        sub.periods.push({
          period_id: p.id,
          period_name: p.name ?? '—',
          order_index: p.order_index ?? 0,
          coefficient,
          grade_value: 0,
        });
      }
      subjectMap.set(sid, sub);
    }

    const periodList = periods.map((p) => ({ id: p.id, name: p.name, order_index: p.order_index ?? 0 }));
    const subjectList = Array.from(subjectMap.values()).sort((a, b) =>
      (a.subject_name || '').localeCompare(b.subject_name || ''),
    );
    const ay = periods[0]?.academic_year;
    return {
      academic_year_id: academicYearId,
      academic_year_name: ay?.name ?? null,
      periods: periodList,
      subjects: subjectList,
    };
  }
}
