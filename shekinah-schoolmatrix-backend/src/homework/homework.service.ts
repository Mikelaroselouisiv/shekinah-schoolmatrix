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
import { isPreschoolClass } from '../utils/preschool';

function todayInHaiti(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Port-au-Prince',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function lessonStillOpen(dueDate?: string | null): boolean {
  if (!dueDate) return true;
  return dueDate.slice(0, 10) >= todayInHaiti();
}

export type HomeworkResult = 'PASSE' | 'A_REFAIRE' | 'A_RELIRE';

function resultLabel(result: string | null | undefined): string | null {
  if (result === 'PASSE') return 'Passé';
  if (result === 'A_REFAIRE') return 'À refaire';
  if (result === 'A_RELIRE') return 'À relire';
  return null;
}

function parseResult(value: unknown): HomeworkResult | null {
  if (value === 'PASSE' || value === 'A_REFAIRE' || value === 'A_RELIRE') return value;
  return null;
}

function parseCoefficient(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 999) {
    throw new BadRequestException('Le coefficient doit être un nombre positif.');
  }
  return n.toFixed(2);
}

function gradeMarks(g?: {
  score?: string | null;
  comment?: string | null;
  source?: string | null;
  content?: string | null;
  result?: string | null;
} | null) {
  const result = parseResult(g?.result);
  return {
    source: g?.source === 'LIVRE' || g?.source === 'PHRASE' ? g.source : null,
    content: g?.content ?? null,
    score: g?.score ?? null,
    comment: g?.comment ?? null,
    result,
    result_label: resultLabel(result),
  };
}

function serializeAssignment(a: HomeworkAssignment) {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    instructions: a.instructions ?? null,
    due_date: a.due_date ?? null,
    coefficient:
      a.coefficient != null && a.coefficient !== '' ? Number(a.coefficient) : null,
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
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 40);
    const offset = Math.max(filters.offset ?? 0, 0);
    const qb = this.assignmentRepo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.class', 'class')
      .leftJoinAndSelect('h.subject', 'subject')
      .leftJoinAndSelect('h.teacher', 'teacher')
      .leftJoinAndSelect('h.academic_year', 'academic_year')
      .orderBy('h.created_at', 'DESC')
      .addOrderBy('h.due_date', 'DESC', 'NULLS LAST');
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
    const q = filters.q?.trim().replace(/[%_]/g, '');
    if (q) {
      qb.andWhere(
        `(h.title ILIKE :q OR COALESCE(h.instructions, '') ILIKE :q OR COALESCE(subject.name, '') ILIKE :q)`,
        { q: `%${q}%` },
      );
    }
    const [list, total] = await qb.skip(offset).take(limit).getManyAndCount();
    const ids = list.map((a) => a.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const rows = await this.gradeRepo
        .createQueryBuilder('g')
        .select('g.assignment_id', 'assignment_id')
        .addSelect('COUNT(*)', 'count')
        .where('g.assignment_id IN (:...ids)', { ids })
        .andWhere('g.included = true')
        .groupBy('g.assignment_id')
        .getRawMany<{ assignment_id: string; count: string }>();
      for (const row of rows) {
        const id = row.assignment_id ?? (row as { assignment_id?: string }).assignment_id;
        if (id) counts.set(id, Number(row.count) || 0);
      }
    }
    return {
      assignments: list.map((a) => ({
        ...serializeAssignment(a),
        student_count: counts.get(a.id) ?? 0,
        is_preschool: isPreschoolClass(a.class?.description, a.class?.level),
      })),
      total,
      limit,
      offset,
      has_more: offset + list.length < total,
    };
  }

  /** Professeur : uniquement les élèves de ses salles. Les autres rôles voient la classe. */
  private async studentsForClass(classId: string, userId?: number, role?: string) {
    if (userId && isTeacherRoleName(role)) {
      return this.teachersService.findActiveStudentsInTeacherRooms(userId, classId);
    }
    return this.studentRepo.find({
      where: { class: { id: classId }, active: true },
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
  }

  async listRoster(userId: number, role: string | undefined, classId: string) {
    if (!classId) throw new BadRequestException('class_id requis');
    await this.assertCanWrite(userId, role, classId);
    const students = await this.studentsForClass(classId, userId, role);
    return students.map((s) => ({
      student_id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
    }));
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
    const preschool = isPreschoolClass(a.class?.description, a.class?.level);
    const grades = await this.gradeRepo.find({
      where: { assignment: { id } },
      relations: ['student'],
    });
    const savedStudents = grades
      .filter((g) => g.included !== false && g.student)
      .map((g) => ({
        student_id: g.student.id,
        first_name: g.student.first_name,
        last_name: g.student.last_name,
        included: true,
        ...gradeMarks(g),
        grade_id: g.id,
      }))
      .sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name, 'fr') ||
          a.first_name.localeCompare(b.first_name, 'fr'),
      );
    if (preschool) {
      return {
        ...serializeAssignment(a),
        is_preschool: true,
        students: savedStudents,
      };
    }
    const students = classId
      ? await this.studentsForClass(classId, userId, role)
      : [];
    const byStudent = new Map(grades.map((g) => [g.student.id, g]));
    return {
      ...serializeAssignment(a),
      is_preschool: false,
      students: students.map((s) => {
        const g = byStudent.get(s.id);
        return {
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          included: !!g && g.included !== false,
          ...gradeMarks(g),
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
      student_ids?: string[];
      coefficient?: string | number | null;
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
      coefficient: parseCoefficient(body.coefficient),
      class: { id: body.class_id },
      subject: body.subject_id ? { id: body.subject_id } : null,
      teacher: { id: userId },
      academic_year: body.academic_year_id
        ? { id: body.academic_year_id }
        : null,
    });
    const saved = await this.assignmentRepo.save(a);
    if (body.student_ids) {
      await this.syncIncludedStudents(saved.id, body.class_id, body.student_ids);
    }
    return this.getOneForTeacher(saved.id, userId, role);
  }

  /** Enregistre les élèves cochés sur le devoir. La ligne existe dans homework_grade. */
  private async syncIncludedStudents(
    assignmentId: string,
    classId: string,
    studentIds: string[],
  ) {
    const wanted = [...new Set(studentIds.filter(Boolean))];
    const inClass = wanted.length
      ? await this.studentRepo
          .createQueryBuilder('s')
          .where('s.class_id = :classId', { classId })
          .andWhere('s.active = true')
          .andWhere('s.id IN (:...ids)', { ids: wanted })
          .getMany()
      : [];
    const keep = new Set(inClass.map((student) => student.id));
    const grades = await this.gradeRepo.find({
      where: { assignment: { id: assignmentId } },
      relations: ['student'],
    });
    const present = new Set<string>();
    for (const grade of grades) {
      const studentId = grade.student?.id;
      if (!studentId || !keep.has(studentId)) {
        await this.gradeRepo.remove(grade);
        continue;
      }
      present.add(studentId);
      if (grade.included === false) {
        grade.included = true;
        await this.gradeRepo.save(grade);
      }
    }
    for (const studentId of keep) {
      if (present.has(studentId)) continue;
      await this.gradeRepo.save(
        this.gradeRepo.create({
          assignment: { id: assignmentId } as HomeworkAssignment,
          student: { id: studentId } as Student,
          included: true,
        }),
      );
    }
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
      student_ids: string[];
      coefficient: string | number | null;
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
    if (!lessonStillOpen(a.due_date)) {
      throw new ForbiddenException('Cette leçon n’est plus modifiable.');
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
    if (body.coefficient !== undefined) {
      a.coefficient = parseCoefficient(body.coefficient);
    }
    if (body.subject_id !== undefined) {
      a.subject = body.subject_id ? ({ id: body.subject_id } as any) : null;
    }
    await this.assignmentRepo.save(a);
    if (body.student_ids && classId) {
      await this.syncIncludedStudents(id, classId, body.student_ids);
    }
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
    if (!lessonStillOpen(a.due_date)) {
      throw new ForbiddenException('Cette leçon n’est plus modifiable.');
    }
    await this.assignmentRepo.remove(a);
    return { deleted: true };
  }

  async upsertGrades(
    id: string,
    userId: number,
    role: string | undefined,
    records: {
      student_id: string;
      score?: string | null;
      comment?: string | null;
      included?: boolean;
      source?: 'LIVRE' | 'PHRASE' | null;
      content?: string | null;
      result?: HomeworkResult | null;
    }[],
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
    if (!lessonStillOpen(a.due_date)) {
      throw new ForbiddenException('Cette leçon n’est plus modifiable.');
    }
    for (const rec of records) {
      if (!rec.student_id) continue;
      let g = await this.gradeRepo.findOne({
        where: { assignment: { id }, student: { id: rec.student_id } },
      });
      if (rec.included === false) {
        if (g) await this.gradeRepo.remove(g);
        continue;
      }
      if (!g) {
        g = this.gradeRepo.create({
          assignment: { id } as HomeworkAssignment,
          student: { id: rec.student_id } as Student,
          included: true,
        });
      }
      if (rec.included === true) g.included = true;
      if (rec.score !== undefined) {
        g.score = rec.score?.trim() ? rec.score.trim() : null;
      }
      if (rec.comment !== undefined) {
        g.comment = rec.comment?.trim() ? rec.comment.trim() : null;
      }
      if (rec.source !== undefined) {
        g.source = rec.source === 'LIVRE' || rec.source === 'PHRASE' ? rec.source : null;
      }
      if (rec.content !== undefined) {
        g.content = rec.content?.trim() ? rec.content.trim() : null;
      }
      if (rec.result !== undefined) {
        g.result = parseResult(rec.result);
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
    const preschool = isPreschoolClass(student.class?.description, student.class?.level);
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
      assignments: list
        .filter((a) => {
          if (!preschool) return true;
          const g = byAssignment.get(a.id);
          return !!g && g.included !== false;
        })
        .map((a) => {
          const g = byAssignment.get(a.id);
          return {
            ...serializeAssignment(a),
            ...gradeMarks(g),
          };
        }),
    };
  }

  /** Historique du dossier : travaux de la classe actuelle, plus les notes déjà saisies dans une classe précédente. */
  async historyForDossier(studentId: string) {
    const current = await this.listForStudent(studentId);
    const seen = new Set(current.assignments.map((a) => a.id));
    const grades = await this.gradeRepo.find({
      where: { student: { id: studentId } },
      relations: ['assignment', 'assignment.class', 'assignment.subject', 'assignment.teacher', 'assignment.academic_year'],
    });
    const past = grades
      .filter((g) => g.assignment && !seen.has(g.assignment.id) && g.included !== false)
      .map((g) => ({
        ...serializeAssignment(g.assignment),
        ...gradeMarks(g),
      }));
    return [...current.assignments, ...past].sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
  }
}
