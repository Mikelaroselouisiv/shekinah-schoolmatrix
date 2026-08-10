import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreschoolGrade } from './preschool-grade.entity';
import { Student } from '../students/student.entity';
import { ScheduleSlot } from '../teachers/schedule-slot.entity';

@Injectable()
export class PreschoolGradesService {
  constructor(
    @InjectRepository(PreschoolGrade)
    private readonly preschoolGradeRepo: Repository<PreschoolGrade>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(ScheduleSlot)
    private readonly scheduleSlotRepo: Repository<ScheduleSlot>,
  ) {}

  async getTeacherForClassSubject(classId: string, subjectId: string): Promise<{ id: number; name: string } | null> {
    const slot = await this.scheduleSlotRepo.findOne({
      where: { class: { id: classId }, subject: { id: subjectId } },
      relations: ['teacher'],
    });
    if (!slot?.teacher) return null;
    const t = slot.teacher;
    return { id: t.id, name: [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email };
  }

  async getPreschoolFormData(params: {
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
    const existing = await this.preschoolGradeRepo.find({
      where: {
        academic_year: { id: params.academic_year_id },
        class: { id: params.class_id },
        subject: { id: params.subject_id },
        period: { id: params.period_id },
      },
      relations: ['student'],
    });
    const byStudent: Record<string, { id: string; level?: string; frequency?: string; observation?: string }> = {};
    for (const g of existing) {
      const sid = g.student?.id;
      if (sid) byStudent[sid] = { id: g.id, level: g.level ?? undefined, frequency: g.frequency ?? undefined, observation: g.observation ?? undefined };
    }
    const teacher = await this.getTeacherForClassSubject(params.class_id, params.subject_id);
    const rows = students.map((s) => {
      const ex = byStudent[s.id];
      return {
        student_id: s.id,
        student_name: `${s.first_name} ${s.last_name}`,
        level: ex?.level ?? null,
        frequency: ex?.frequency ?? null,
        observation: ex?.observation ?? '',
        grade_id: ex?.id ?? null,
      };
    });
    return { teacher, rows };
  }

  async hasExistingPreschoolGrades(params: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    period_id: string;
  }): Promise<boolean> {
    const count = await this.preschoolGradeRepo.count({
      where: {
        academic_year: { id: params.academic_year_id },
        class: { id: params.class_id },
        subject: { id: params.subject_id },
        period: { id: params.period_id },
      },
    });
    return count > 0;
  }

  async savePreschoolGrades(params: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    period_id: string;
    grades: { student_id: string; level?: string; frequency?: string; observation?: string }[];
  }): Promise<{ ok: boolean }> {
    for (const g of params.grades) {
      const student = await this.studentRepo.findOne({ where: { id: g.student_id } });
      if (!student) throw new BadRequestException(`Élève ${g.student_id} introuvable.`);
      const existing = await this.preschoolGradeRepo.findOne({
        where: {
          student: { id: g.student_id },
          academic_year: { id: params.academic_year_id },
          subject: { id: params.subject_id },
          period: { id: params.period_id },
        },
      });
      const level = g.level && g.level.trim() ? g.level : undefined;
      const frequency = g.frequency && g.frequency.trim() ? g.frequency : undefined;
      const observation = g.observation?.trim() || undefined;
      if (existing) {
        existing.level = level;
        existing.frequency = frequency;
        existing.observation = observation;
        await this.preschoolGradeRepo.save(existing);
      } else {
        if (!level && !frequency && !observation) continue;
        const ng = this.preschoolGradeRepo.create({
          student: { id: g.student_id },
          academic_year: { id: params.academic_year_id },
          class: { id: params.class_id },
          subject: { id: params.subject_id },
          period: { id: params.period_id },
          level,
          frequency,
          observation,
        });
        await this.preschoolGradeRepo.save(ng);
      }
    }
    return { ok: true };
  }

  async getStudentPreschoolResults(studentId: string, academicYearId: string): Promise<any> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class'],
    });
    if (!student) throw new NotFoundException('Student not found');
    const classId = student.class?.id;
    if (!classId) return { periods: [], subjects: [], academic_year_name: null };
    const grades = await this.preschoolGradeRepo.find({
      where: { student: { id: studentId }, academic_year: { id: academicYearId } },
      relations: ['subject', 'period', 'academic_year'],
    });
    const periodSet = new Map<string, { id: string; name: string; order_index: number }>();
    const subjectSet = new Map<string, { id: string; name: string }>();
    const cells: Record<string, { level?: string; frequency?: string; observation?: string }> = {};
    for (const g of grades) {
      const pid = g.period?.id;
      const sid = g.subject?.id;
      if (pid && sid) {
        periodSet.set(pid, { id: pid, name: g.period.name ?? '—', order_index: g.period.order_index ?? 0 });
        subjectSet.set(sid, { id: sid, name: g.subject.name ?? '—' });
        cells[`${sid}:${pid}`] = { level: g.level ?? undefined, frequency: g.frequency ?? undefined, observation: g.observation ?? undefined };
      }
    }
    const periods = Array.from(periodSet.values()).sort((a, b) => a.order_index - b.order_index);
    const subjects = Array.from(subjectSet.values()).sort((a, b) => a.name.localeCompare(b.name));
    const ayName = grades[0]?.academic_year ? grades[0].academic_year.name : null;
    return {
      academic_year_id: academicYearId,
      academic_year_name: ayName ?? null,
      periods,
      subjects,
      cells,
    };
  }
}
