import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HomeworkAssignment, HomeworkKind } from './homework-assignment.entity';
import { HomeworkGrade } from './homework-grade.entity';
import { Student } from '../students/student.entity';
import { TeachersService } from '../teachers/teachers.service';
import { isTeacherRoleName } from '../roles/roles.constants';

function serializeAssignment(a: HomeworkAssignment) {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    instructions: a.instructions ?? null,
    due_date: a.due_date ?? null,
    class_id: a.class?.id ?? null,
    class_name: a.class?.name ?? null,
    subject_id: a.subject?.id ?? null,
    subject_name: a.subject?.name ?? null,
    teacher_id: a.teacher?.id ?? null,
    teacher_name: a.teacher
      ? `${a.teacher.first_name ?? ''} ${a.teacher.last_name ?? ''}`.trim()
      : null,
    academic_year_id: a.academic_year?.id ?? null,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

@Injectable()
export class HomeworkService {
  constructor(
    @InjectRepository(HomeworkAssignment)
    private readonly assignmentRepo: Repository<HomeworkAssignment>,
    @InjectRepository(HomeworkGrade)
    private readonly gradeRepo: Repository<HomeworkGrade>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    private readonly teachersService: TeachersService,
  ) {}

  private async assertCanWrite(
    userId: number,
    role: string | undefined,
    classId: string,
  ) {
    if (!isTeacherRoleName(role)) return;
    await this.teachersService.assertTeacherAssignedToClass(userId, classId);
  }

  async listForTeacher(filters: {
    teacherId?: number;
    class_id?: string;
    kind?: string;
    academic_year_id?: string;
  }) {
    const qb = this.assignmentRepo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.class', 'class')
      .leftJoinAndSelect('h.subject', 'subject')
      .leftJoinAndSelect('h.teacher', 'teacher')
      .leftJoinAndSelect('h.academic_year', 'academic_year')
      .orderBy('h.due_date', 'DESC', 'NULLS LAST')
      .addOrderBy('h.created_at', 'DESC');
    if (filters.teacherId) {
      qb.andWhere('h.teacher_id = :tid', { tid: filters.teacherId });
    }
    if (filters.class_id) {
      qb.andWhere('h.class_id = :cid', { cid: filters.class_id });
    }
    if (filters.kind === 'DEVOIR' || filters.kind === 'LECON') {
      qb.andWhere('h.kind = :kind', { kind: filters.kind });
    }
    if (filters.academic_year_id) {
      qb.andWhere('h.academic_year_id = :yid', {
        yid: filters.academic_year_id,
      });
    }
    const list = await qb.getMany();
    return list.map(serializeAssignment);
  }

  async getOneForTeacher(id: string, userId: number, role?: string) {
    const a = await this.assignmentRepo.findOne({
      where: { id },
      relations: ['class', 'subject', 'teacher', 'academic_year'],
    });
    if (!a) throw new NotFoundException('Travail introuvable');
    const classId = a.class?.id;
    if (classId && isTeacherRoleName(role)) {
      await this.teachersService.assertTeacherAssignedToClass(userId, classId);
    }
    const students = classId
      ? await this.studentRepo.find({
          where: { class: { id: classId }, active: true },
          order: { last_name: 'ASC', first_name: 'ASC' },
        })
      : [];
    const grades = await this.gradeRepo.find({
      where: { assignment: { id } },
      relations: ['student'],
    });
    const byStudent = new Map(grades.map((g) => [g.student.id, g]));
    return {
      ...serializeAssignment(a),
      students: students.map((s) => {
        const g = byStudent.get(s.id);
        return {
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          score: g?.score ?? null,
          comment: g?.comment ?? null,
          grade_id: g?.id ?? null,
        };
      }),
    };
  }

  async create(
    userId: number,
    role: string | undefined,
    body: {
      kind: HomeworkKind;
      title: string;
      instructions?: string | null;
      due_date?: string | null;
      class_id: string;
      subject_id?: string | null;
      academic_year_id?: string | null;
    },
  ) {
    if (body.kind !== 'DEVOIR' && body.kind !== 'LECON') {
      throw new BadRequestException('kind doit être DEVOIR ou LECON');
    }
    const title = body.title?.trim();
    if (!title) throw new BadRequestException('Titre requis');
    if (!body.class_id) throw new BadRequestException('class_id requis');
    await this.assertCanWrite(userId, role, body.class_id);
    const a = this.assignmentRepo.create({
      kind: body.kind,
      title,
      instructions: body.instructions?.trim() || null,
      due_date: body.due_date || null,
      class: { id: body.class_id },
      subject: body.subject_id ? { id: body.subject_id } : null,
      teacher: { id: userId },
      academic_year: body.academic_year_id
        ? { id: body.academic_year_id }
        : null,
    });
    const saved = await this.assignmentRepo.save(a);
    return this.getOneForTeacher(saved.id, userId, role);
  }

  async update(
    id: string,
    userId: number,
    role: string | undefined,
    body: Partial<{
      kind: HomeworkKind;
      title: string;
      instructions: string | null;
      due_date: string | null;
      subject_id: string | null;
    }>,
  ) {
    const a = await this.assignmentRepo.findOne({
      where: { id },
      relations: ['class', 'teacher'],
    });
    if (!a) throw new NotFoundException('Travail introuvable');
    const classId = a.class?.id;
    if (classId) await this.assertCanWrite(userId, role, classId);
    if (isTeacherRoleName(role) && a.teacher?.id !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos travaux.');
    }
    if (body.kind === 'DEVOIR' || body.kind === 'LECON') a.kind = body.kind;
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) throw new BadRequestException('Titre requis');
      a.title = title;
    }
    if (body.instructions !== undefined) {
      a.instructions = body.instructions?.trim() || null;
    }
    if (body.due_date !== undefined) a.due_date = body.due_date || null;
    if (body.subject_id !== undefined) {
      a.subject = body.subject_id ? ({ id: body.subject_id } as any) : null;
    }
    await this.assignmentRepo.save(a);
    return this.getOneForTeacher(id, userId, role);
  }

  async remove(id: string, userId: number, role?: string) {
    const a = await this.assignmentRepo.findOne({
      where: { id },
      relations: ['class', 'teacher'],
    });
    if (!a) throw new NotFoundException('Travail introuvable');
    const classId = a.class?.id;
    if (classId) await this.assertCanWrite(userId, role, classId);
    if (isTeacherRoleName(role) && a.teacher?.id !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos travaux.');
    }
    await this.assignmentRepo.remove(a);
    return { deleted: true };
  }

  async upsertGrades(
    id: string,
    userId: number,
    role: string | undefined,
    records: { student_id: string; score?: string | null; comment?: string | null }[],
  ) {
    const a = await this.assignmentRepo.findOne({
      where: { id },
      relations: ['class', 'teacher'],
    });
    if (!a) throw new NotFoundException('Travail introuvable');
    const classId = a.class?.id;
    if (classId) await this.assertCanWrite(userId, role, classId);
    if (isTeacherRoleName(role) && a.teacher?.id !== userId) {
      throw new ForbiddenException('Vous ne pouvez noter que vos travaux.');
    }
    for (const rec of records) {
      if (!rec.student_id) continue;
      let g = await this.gradeRepo.findOne({
        where: { assignment: { id }, student: { id: rec.student_id } },
      });
      if (!g) {
        g = this.gradeRepo.create({
          assignment: { id } as HomeworkAssignment,
          student: { id: rec.student_id } as Student,
        });
      }
      if (rec.score !== undefined) {
        g.score = rec.score?.trim() ? rec.score.trim() : null;
      }
      if (rec.comment !== undefined) {
        g.comment = rec.comment?.trim() ? rec.comment.trim() : null;
      }
      await this.gradeRepo.save(g);
    }
    return this.getOneForTeacher(id, userId, role);
  }

  async listForStudent(studentId: string) {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class'],
    });
    if (!student) throw new NotFoundException('Élève introuvable');
    const classId = student.class?.id;
    if (!classId) {
      return {
        student_id: studentId,
        class_id: null,
        assignments: [] as ReturnType<typeof serializeAssignment>[],
      };
    }
    const list = await this.assignmentRepo.find({
      where: { class: { id: classId } },
      relations: ['class', 'subject', 'teacher', 'academic_year'],
      order: { created_at: 'DESC' },
    });
    const grades = await this.gradeRepo.find({
      where: { student: { id: studentId } },
      relations: ['assignment'],
    });
    const byAssignment = new Map(
      grades.map((g) => [g.assignment.id, g]),
    );
    return {
      student_id: studentId,
      class_id: classId,
      class_name: student.class?.name ?? null,
      assignments: list.map((a) => {
        const g = byAssignment.get(a.id);
        return {
          ...serializeAssignment(a),
          score: g?.score ?? null,
          comment: g?.comment ?? null,
        };
      }),
    };
  }
}
