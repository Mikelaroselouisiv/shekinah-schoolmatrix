import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreschoolGrade } from './preschool-grade.entity';
import { Student } from '../students/student.entity';
import { ScheduleSlot } from '../teachers/schedule-slot.entity';
import { Period } from '../period/period.entity';
import { Subject } from '../subjects/subject.entity';
import { StudentClassAssignment } from '../formation-classe/student-class-assignment.entity';
import {
  isPreschoolEvalMode,
  isYearEndDecision,
  normalizePreschoolFrequency,
  normalizePreschoolLevel,
  PRESCHOOL_EVAL_FREQUENCY,
  PRESCHOOL_EVAL_LEVEL,
} from './preschool-scale';

@Injectable()
export class PreschoolGradesService {
  constructor(
    @InjectRepository(PreschoolGrade)
    private readonly preschoolGradeRepo: Repository<PreschoolGrade>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(ScheduleSlot)
    private readonly scheduleSlotRepo: Repository<ScheduleSlot>,
    @InjectRepository(Period)
    private readonly periodRepo: Repository<Period>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(StudentClassAssignment)
    private readonly assignmentRepo: Repository<StudentClassAssignment>,
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

  async isLastPeriod(academicYearId: string, periodId: string): Promise<boolean> {
    const current = await this.periodRepo.findOne({ where: { id: periodId } });
    const scope = current?.scope === 'PRESCOLAIRE' ? 'PRESCOLAIRE' : 'ECOLE';
    const periods = await this.periodRepo.find({
      where: { academic_year: { id: academicYearId }, scope },
      order: { order_index: 'ASC' },
    });
    if (!periods.length) return false;
    return periods[periods.length - 1].id === periodId;
  }

  async getEvalMode(subjectId: string): Promise<'LEVEL' | 'FREQUENCY'> {
    const subject = await this.subjectRepo.findOne({ where: { id: subjectId } });
    return subject?.preschool_eval === PRESCHOOL_EVAL_FREQUENCY
      ? PRESCHOOL_EVAL_FREQUENCY
      : PRESCHOOL_EVAL_LEVEL;
  }

  async setEvalMode(subjectId: string, mode: string): Promise<'LEVEL' | 'FREQUENCY'> {
    if (!isPreschoolEvalMode(mode)) {
      throw new BadRequestException('Mode d’évaluation invalide');
    }
    const subject = await this.subjectRepo.findOne({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Matière introuvable');
    subject.preschool_eval = mode;
    await this.subjectRepo.save(subject);
    return mode;
  }

  private async ensureAssignments(academicYearId: string, classId: string, students: Student[]) {
    for (const s of students) {
      const existing = await this.assignmentRepo.findOne({
        where: { student: { id: s.id }, academic_year: { id: academicYearId } },
      });
      if (existing) continue;
      const a = this.assignmentRepo.create({
        student: { id: s.id },
        academic_year: { id: academicYearId },
        class: { id: classId },
        decision: null,
        average: null,
      });
      await this.assignmentRepo.save(a);
    }
  }

  async getPreschoolFormData(params: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    period_id: string;
  }): Promise<any> {
    const students = await this.studentRepo.find({
      where: { class: { id: params.class_id }, active: true },
      relations: ['class'],
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
    await this.ensureAssignments(params.academic_year_id, params.class_id, students);
    const assignments = await this.assignmentRepo.find({
      where: { academic_year: { id: params.academic_year_id } },
      relations: ['student'],
    });
    const assignmentByStudent = new Map<string, StudentClassAssignment>();
    for (const a of assignments) {
      const sid = a.student?.id;
      if (sid) assignmentByStudent.set(sid, a);
    }
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
      if (sid) {
        byStudent[sid] = {
          id: g.id,
          level: normalizePreschoolLevel(g.level) ?? undefined,
          frequency: normalizePreschoolFrequency(g.frequency) ?? undefined,
          observation: g.observation ?? undefined,
        };
      }
    }
    const teacher = await this.getTeacherForClassSubject(params.class_id, params.subject_id);
    const evalMode = await this.getEvalMode(params.subject_id);
    const isLastPeriod = await this.isLastPeriod(params.academic_year_id, params.period_id);
    const rows = students.map((s) => {
      const ex = byStudent[s.id];
      const assignment = assignmentByStudent.get(s.id);
      return {
        student_id: s.id,
        student_name: `${s.first_name} ${s.last_name}`,
        level: ex?.level ?? null,
        frequency: ex?.frequency ?? null,
        observation: ex?.observation ?? '',
        grade_id: ex?.id ?? null,
        assignment_id: assignment?.id ?? null,
        decision: assignment?.decision ?? null,
      };
    });
    return { teacher, rows, eval_mode: evalMode, is_last_period: isLastPeriod };
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
    decisions?: { assignment_id: string; decision?: string | null }[];
  }): Promise<{ ok: boolean }> {
    const evalMode = await this.getEvalMode(params.subject_id);
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
      const level =
        evalMode === PRESCHOOL_EVAL_LEVEL ? normalizePreschoolLevel(g.level) ?? undefined : undefined;
      const frequency =
        evalMode === PRESCHOOL_EVAL_FREQUENCY
          ? normalizePreschoolFrequency(g.frequency) ?? undefined
          : undefined;
      const observation = g.observation?.trim() || undefined;
      if (existing) {
        existing.level = level ?? null;
        existing.frequency = frequency ?? null;
        existing.observation = observation ?? null;
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

    const isLastPeriod = await this.isLastPeriod(params.academic_year_id, params.period_id);
    if (isLastPeriod && params.decisions?.length) {
      for (const d of params.decisions) {
        if (!d.assignment_id) continue;
        const assignment = await this.assignmentRepo.findOne({ where: { id: d.assignment_id } });
        if (!assignment) continue;
        const raw = d.decision?.trim() || '';
        if (!raw) {
          assignment.decision = null;
        } else if (!isYearEndDecision(raw)) {
          throw new BadRequestException('Décision invalide');
        } else {
          assignment.decision = raw;
        }
        await this.assignmentRepo.save(assignment);
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
        cells[`${sid}:${pid}`] = {
          level: normalizePreschoolLevel(g.level) ?? undefined,
          frequency: normalizePreschoolFrequency(g.frequency) ?? undefined,
          observation: g.observation ?? undefined,
        };
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
