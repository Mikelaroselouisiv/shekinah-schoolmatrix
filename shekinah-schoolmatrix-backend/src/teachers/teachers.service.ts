import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ClassTeacher } from './class-teacher.entity';
import { TeacherSubject } from './teacher-subject.entity';
import { TeacherClassSubject } from './teacher-class-subject.entity';
import { ScheduleSlot } from './schedule-slot.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { Class } from '../classes/class.entity';
import { Subject } from '../subjects/subject.entity';
import { Room } from '../rooms/room.entity';
import { Student } from '../students/student.entity';
import {
  TEACHER_ROLE_NAMES,
  isTeacherRoleName,
} from '../roles/roles.constants';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(ClassTeacher)
    private readonly classTeacherRepo: Repository<ClassTeacher>,
    @InjectRepository(TeacherSubject)
    private readonly teacherSubjectRepo: Repository<TeacherSubject>,
    @InjectRepository(TeacherClassSubject)
    private readonly teacherClassSubjectRepo: Repository<TeacherClassSubject>,
    @InjectRepository(ScheduleSlot)
    private readonly scheduleSlotRepo: Repository<ScheduleSlot>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  /**
   * Emploi du temps d'un élève = celui de sa classe.
   * Renvoie une liste vide (et non une erreur) si l'élève n'a pas de classe.
   */
  async getScheduleForStudent(studentId: string, academicYear?: string) {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class'],
    });
    if (!student) throw new NotFoundException('Student not found');

    const classId = student.class?.id ?? null;
    const slots = classId
      ? await this.getScheduleSlots({
          class_id: classId,
          academic_year: academicYear,
        })
      : [];

    return {
      student_id: student.id,
      student_name: `${student.first_name} ${student.last_name}`,
      class_id: classId,
      class_name: student.class?.name ?? null,
      academic_year: academicYear ?? null,
      slots: slots.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        subject_id: s.subject_id ?? null,
        subject_name: s.subject_name ?? null,
        room_id: s.room_id ?? null,
        room_name: s.room_name ?? null,
        teacher_id: s.teacher_id ?? null,
        teacher_name: s.teacher_name ?? null,
        academic_year: s.academic_year,
      })),
    };
  }

  private async resolveRoom(roomId?: string | null): Promise<Room | undefined> {
    if (!roomId) return undefined;
    const room = await this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['class'],
    });
    if (!room) {
      throw new BadRequestException('Salle introuvable');
    }
    return room;
  }

  /** Salle obligatoire, rattachée à la classe pédagogique. */
  private async resolveRoomForClass(
    classId: string,
    roomId?: string | null,
  ): Promise<Room> {
    if (!roomId?.trim()) {
      throw new BadRequestException('La salle (section) est obligatoire');
    }
    const room = await this.resolveRoom(roomId);
    if (!room) {
      throw new BadRequestException('Salle introuvable');
    }
    const roomClassId = room.class?.id ?? (room as any).class_id;
    if (roomClassId && roomClassId !== classId) {
      throw new BadRequestException(
        'Cette salle n’appartient pas à la classe sélectionnée',
      );
    }
    return room;
  }

  async findTeachers(): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .where('UPPER(r.name) IN (:...roles)', { roles: TEACHER_ROLE_NAMES })
      .andWhere('u.active = :active', { active: true })
      .orderBy('u.last_name', 'ASC')
      .addOrderBy('u.first_name', 'ASC')
      .getMany();
  }

  async findOneTeacher(teacherId: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: teacherId },
      relations: ['role'],
    });
    if (!user) throw new NotFoundException('User not found');
    if (!isTeacherRoleName(user.role?.name)) {
      throw new BadRequestException('User is not a teacher');
    }
    return user;
  }

  async getTeacherClasses(teacherId: number) {
    await this.findOneTeacher(teacherId);
    const assignments = await this.classTeacherRepo.find({
      where: { teacher: { id: teacherId } },
      relations: ['class'],
      order: { created_at: 'ASC' },
    });
    return assignments.map((a) => ({
      id: a.id,
      class_id: a.class.id,
      class_name: a.class.name,
      class_level: a.class.level,
      class_section: a.class.section,
      is_main: a.is_main,
      created_at: a.created_at,
    }));
  }

  async addClassTeacher(
    teacherId: number,
    classId: string,
    isMain = false,
  ): Promise<ClassTeacher> {
    await this.findOneTeacher(teacherId);
    const existing = await this.classTeacherRepo.findOne({
      where: { teacher: { id: teacherId }, class: { id: classId } },
    });
    if (existing) {
      throw new BadRequestException('Teacher already assigned to this class');
    }
    const assignment = this.classTeacherRepo.create({
      teacher: { id: teacherId },
      class: { id: classId },
      is_main: isMain,
    });
    return this.classTeacherRepo.save(assignment);
  }

  async removeClassTeacher(teacherId: number, classId: string): Promise<{ deleted: boolean }> {
    const assignment = await this.classTeacherRepo.findOne({
      where: { teacher: { id: teacherId }, class: { id: classId } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.classTeacherRepo.remove(assignment);
    return { deleted: true };
  }

  async getTeacherSubjects(teacherId: number) {
    await this.findOneTeacher(teacherId);
    const assignments = await this.teacherSubjectRepo.find({
      where: { teacher: { id: teacherId } },
      relations: ['subject'],
      order: { created_at: 'ASC' },
    });
    return assignments.map((a) => ({
      id: a.id,
      subject_id: a.subject.id,
      subject_name: a.subject.name,
      subject_code: a.subject.code,
      created_at: a.created_at,
    }));
  }

  async addTeacherSubject(teacherId: number, subjectId: string): Promise<TeacherSubject> {
    await this.findOneTeacher(teacherId);
    const existing = await this.teacherSubjectRepo.findOne({
      where: { teacher: { id: teacherId }, subject: { id: subjectId } },
    });
    if (existing) {
      throw new BadRequestException('Teacher already assigned to this subject');
    }
    const assignment = this.teacherSubjectRepo.create({
      teacher: { id: teacherId },
      subject: { id: subjectId },
    });
    return this.teacherSubjectRepo.save(assignment);
  }

  async removeTeacherSubject(
    teacherId: number,
    subjectId: string,
  ): Promise<{ deleted: boolean }> {
    const assignment = await this.teacherSubjectRepo.findOne({
      where: { teacher: { id: teacherId }, subject: { id: subjectId } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.teacherSubjectRepo.remove(assignment);
    return { deleted: true };
  }

  /** Assignations précises : (classe, salle/section, matière) pour ce professeur. */
  async getTeacherClassSubjects(teacherId: number) {
    await this.findOneTeacher(teacherId);
    const list = await this.teacherClassSubjectRepo.find({
      where: { teacher: { id: teacherId } },
      relations: ['class', 'subject', 'room'],
      order: { created_at: 'ASC' },
    });
    return list.map((a) => ({
      id: a.id,
      class_id: a.class?.id ?? a.class_id,
      class_name: a.class?.name ?? '',
      subject_id: a.subject?.id ?? a.subject_id,
      subject_name: a.subject?.name ?? '',
      room_id: a.room?.id ?? a.room_id ?? null,
      room_name: a.room?.name ?? '',
      created_at: a.created_at,
    }));
  }

  async addTeacherClassSubject(
    teacherId: number,
    classId: string,
    subjectId: string,
    roomId: string,
  ): Promise<TeacherClassSubject> {
    await this.findOneTeacher(teacherId);
    const room = await this.resolveRoomForClass(classId, roomId);
    const existing = await this.teacherClassSubjectRepo.findOne({
      where: {
        teacher: { id: teacherId },
        class: { id: classId },
        subject: { id: subjectId },
        room: { id: room.id },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Ce professeur enseigne déjà cette matière dans cette salle.',
      );
    }
    const assignment = this.teacherClassSubjectRepo.create({
      teacher: { id: teacherId },
      class: { id: classId },
      subject: { id: subjectId },
      room: { id: room.id },
    });
    return this.teacherClassSubjectRepo.save(assignment);
  }

  async addTeacherClassSubjects(
    teacherId: number,
    classId: string,
    roomId: string,
    subjectIds: string[],
  ) {
    const unique = [...new Set(subjectIds.filter(Boolean))];
    if (unique.length === 0) {
      throw new BadRequestException('Au moins une matière est requise');
    }
    const created: TeacherClassSubject[] = [];
    const skipped: string[] = [];
    for (const subjectId of unique) {
      try {
        created.push(
          await this.addTeacherClassSubject(teacherId, classId, subjectId, roomId),
        );
      } catch (e) {
        if (
          e instanceof BadRequestException &&
          String(e.message).includes('déjà')
        ) {
          skipped.push(subjectId);
          continue;
        }
        throw e;
      }
    }
    return { created, skipped };
  }

  /** Assignations (professeur × matière) pour une classe / salle — grille horaire. */
  async findClassSubjectAssignments(filters: {
    classId?: string;
    roomId?: string;
  }) {
    const qb = this.teacherClassSubjectRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.teacher', 'teacher')
      .leftJoinAndSelect('a.class', 'class')
      .leftJoinAndSelect('a.subject', 'subject')
      .leftJoinAndSelect('a.room', 'room')
      .orderBy('teacher.last_name', 'ASC')
      .addOrderBy('subject.name', 'ASC');
    if (filters.classId) {
      qb.andWhere('a.class_id = :classId', { classId: filters.classId });
    }
    if (filters.roomId) {
      qb.andWhere('a.room_id = :roomId', { roomId: filters.roomId });
    }
    const list = await qb.getMany();
    return list.map((a) => ({
      id: a.id,
      teacher_id: a.teacher?.id,
      teacher_name: a.teacher
        ? `${a.teacher.first_name ?? ''} ${a.teacher.last_name ?? ''}`.trim()
        : '',
      class_id: a.class?.id ?? a.class_id,
      class_name: a.class?.name ?? '',
      subject_id: a.subject?.id ?? a.subject_id,
      subject_name: a.subject?.name ?? '',
      room_id: a.room?.id ?? a.room_id ?? null,
      room_name: a.room?.name ?? '',
    }));
  }

  async resolveTeacherIdForSlot(
    classId: string,
    subjectId: string,
    roomId: string,
    teacherId?: number,
  ): Promise<number> {
    if (teacherId) return teacherId;
    const list = await this.teacherClassSubjectRepo.find({
      where: {
        class: { id: classId },
        subject: { id: subjectId },
        room: { id: roomId },
      },
      relations: ['teacher'],
    });
    const ids = [
      ...new Set(list.map((a) => a.teacher?.id).filter((id): id is number => !!id)),
    ];
    if (ids.length === 0) {
      throw new BadRequestException(
        'Aucun professeur n’est assigné à cette matière dans cette salle.',
      );
    }
    if (ids.length > 1) {
      throw new BadRequestException(
        'Plusieurs professeurs enseignent cette matière dans cette salle. Précisez le professeur.',
      );
    }
    return ids[0];
  }

  async removeTeacherClassSubject(
    teacherId: number,
    assignmentId: string,
  ): Promise<{ deleted: boolean }> {
    const assignment = await this.teacherClassSubjectRepo.findOne({
      where: { id: assignmentId, teacher: { id: teacherId } },
    });
    if (!assignment) throw new NotFoundException('Assignation introuvable');
    await this.teacherClassSubjectRepo.remove(assignment);
    return { deleted: true };
  }

  /** Classes dans lesquelles ce professeur enseigne (au moins une matière). */
  async getTeacherClassesForGrades(teacherId: number) {
    const list = await this.teacherClassSubjectRepo.find({
      where: { teacher: { id: teacherId } },
      relations: ['class'],
      order: { created_at: 'ASC' },
    });
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const a of list) {
      const cid = a.class?.id ?? (a as any).class_id;
      if (cid && !seen.has(cid)) {
        seen.add(cid);
        result.push({
          id: cid,
          name: a.class?.name ?? '',
        });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Matières que ce professeur enseigne dans cette classe (pour saisie des notes). */
  async getTeacherSubjectsInClass(teacherId: number, classId: string) {
    const list = await this.teacherClassSubjectRepo.find({
      where: {
        teacher: { id: teacherId },
        class: { id: classId },
      },
      relations: ['subject'],
      order: { created_at: 'ASC' },
    });
    return list.map((a) => ({
      id: a.subject?.id ?? (a as any).subject_id,
      name: a.subject?.name ?? '',
    }));
  }

  async findTeachersForClassAndSubject(
    classId?: string,
    subjectId?: string,
  ): Promise<User[]> {
    if (!classId || !subjectId) return this.findTeachers();
    const [classAssignments, subjectAssignments] = await Promise.all([
      this.classTeacherRepo.find({
        where: { class: { id: classId } },
        relations: ['teacher'],
      }),
      this.teacherSubjectRepo.find({
        where: { subject: { id: subjectId } },
        relations: ['teacher'],
      }),
    ]);
    const classTeacherIds = new Set(classAssignments.map((a) => a.teacher.id));
    const subjectTeacherIds = new Set(subjectAssignments.map((a) => a.teacher.id));
    const userIds = [...classTeacherIds].filter((id) => subjectTeacherIds.has(id));
    if (userIds.length === 0) return [];
    const users = await this.userRepo.find({
      where: { id: In(userIds), active: true },
      relations: ['role'],
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
    return users.filter((u) => isTeacherRoleName(u.role?.name));
  }

  async getScheduleSlots(filters: {
    class_id?: string;
    room_id?: string;
    teacher_id?: number;
    day_of_week?: number;
    academic_year?: string;
  }) {
    const qb = this.scheduleSlotRepo
      .createQueryBuilder('slot')
      .leftJoinAndSelect('slot.class', 'class')
      .leftJoinAndSelect('slot.subject', 'subject')
      .leftJoinAndSelect('slot.teacher', 'teacher')
      .leftJoinAndSelect('slot.room', 'room')
      .orderBy('slot.academic_year', 'ASC')
      .addOrderBy('slot.day_of_week', 'ASC')
      .addOrderBy('slot.start_time', 'ASC');
    if (filters.class_id) {
      qb.andWhere('slot.class_id = :class_id', { class_id: filters.class_id });
    }
    if (filters.room_id) {
      qb.andWhere('slot.room_id = :room_id', { room_id: filters.room_id });
    }
    if (filters.teacher_id) {
      qb.andWhere('slot.teacher_id = :teacher_id', {
        teacher_id: filters.teacher_id,
      });
    }
    if (filters.day_of_week != null) {
      qb.andWhere('slot.day_of_week = :day_of_week', {
        day_of_week: filters.day_of_week,
      });
    }
    if (filters.academic_year) {
      qb.andWhere('slot.academic_year = :academic_year', {
        academic_year: filters.academic_year,
      });
    }
    const slots = await qb.getMany();
    return slots.map((s) => ({
      id: s.id,
      academic_year: s.academic_year ?? null,
      class_id: s.class?.id,
      class_name: s.class?.name,
      subject_id: s.subject?.id,
      subject_name: s.subject?.name,
      teacher_id: s.teacher?.id,
      teacher_name: s.teacher
        ? `${s.teacher.first_name} ${s.teacher.last_name}`
        : null,
      room_id: s.room?.id,
      room_name: s.room?.name,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));
  }

  async createScheduleSlot(params: {
    academic_year?: string;
    class_id: string;
    subject_id: string;
    teacher_id?: number;
    room_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }): Promise<ScheduleSlot> {
    const room = await this.resolveRoomForClass(params.class_id, params.room_id);
    const teacherId = await this.resolveTeacherIdForSlot(
      params.class_id,
      params.subject_id,
      room.id,
      params.teacher_id,
    );
    const slot = this.scheduleSlotRepo.create({
      academic_year: params.academic_year?.trim() || undefined,
      class: { id: params.class_id },
      subject: { id: params.subject_id },
      teacher: { id: teacherId },
      room,
      day_of_week: params.day_of_week,
      start_time: params.start_time,
      end_time: params.end_time,
    });
    return this.scheduleSlotRepo.save(slot);
  }

  async updateScheduleSlot(
    id: string,
    params: Partial<{
      academic_year: string;
      class_id: string;
      subject_id: string;
      teacher_id: number;
      room_id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>,
  ): Promise<ScheduleSlot> {
    const slot = await this.scheduleSlotRepo.findOne({
      where: { id },
      relations: ['class', 'subject', 'teacher', 'room'],
    });
    if (!slot) throw new NotFoundException('Schedule slot not found');
    if (params.academic_year !== undefined) {
      slot.academic_year = params.academic_year?.trim() || undefined;
    }
    if (params.class_id !== undefined) slot.class = { id: params.class_id } as Class;
    if (params.subject_id !== undefined) slot.subject = { id: params.subject_id } as Subject;
    if (params.teacher_id !== undefined) slot.teacher = { id: params.teacher_id } as User;
    const classId =
      params.class_id ?? slot.class?.id ?? (slot as any).class_id;
    if (params.room_id !== undefined) {
      slot.room = await this.resolveRoomForClass(classId, params.room_id);
    } else if (params.class_id !== undefined && slot.room?.id) {
      // Revalider la salle si la classe change
      slot.room = await this.resolveRoomForClass(params.class_id, slot.room.id);
    }
    if (params.day_of_week !== undefined) slot.day_of_week = params.day_of_week;
    if (params.start_time !== undefined) slot.start_time = params.start_time;
    if (params.end_time !== undefined) slot.end_time = params.end_time;
    return this.scheduleSlotRepo.save(slot);
  }

  async deleteScheduleSlot(id: string): Promise<{ deleted: boolean }> {
    const slot = await this.scheduleSlotRepo.findOne({ where: { id } });
    if (!slot) throw new NotFoundException('Schedule slot not found');
    await this.scheduleSlotRepo.remove(slot);
    return { deleted: true };
  }
}
