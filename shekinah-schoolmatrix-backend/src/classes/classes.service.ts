import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Class } from './class.entity';
import { ClassSubject } from './class-subject.entity';
import { Room } from '../rooms/room.entity';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(ClassSubject)
    private readonly classSubjectRepo: Repository<ClassSubject>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
  ) {}

  private async resolveRoom(roomId?: string | null): Promise<Room | undefined> {
    if (!roomId) return undefined;
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) {
      throw new BadRequestException('Salle introuvable');
    }
    return room;
  }

  async findAll(): Promise<Class[]> {
    return this.classRepo.find({
      relations: ['room', 'rooms', 'students'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Class> {
    const c = await this.classRepo.findOne({
      where: { id },
      relations: ['students', 'room', 'rooms'],
    });
    if (!c) {
      throw new NotFoundException('Class not found');
    }
    return c;
  }

  async getClassSubjectIds(classId: string): Promise<string[]> {
    const assignments = await this.classSubjectRepo.find({
      where: { class: { id: classId } },
      relations: ['subject'],
    });
    return assignments.map((a) => a.subject.id);
  }

  async getClassSubjects(classId: string) {
    const assignments = await this.classSubjectRepo.find({
      where: { class: { id: classId } },
      relations: ['subject'],
      order: { created_at: 'ASC' },
    });
    return assignments.map((a) => ({
      id: a.subject.id,
      name: a.subject.name,
      code: a.subject.code,
    }));
  }

  async setClassSubjects(classId: string, subjectIds: string[]): Promise<void> {
    await this.classSubjectRepo.delete({ class_id: classId });
    const uniqueIds = [...new Set(subjectIds.filter(Boolean))];
    for (const subjectId of uniqueIds) {
      const cs = this.classSubjectRepo.create({
        class: { id: classId },
        subject: { id: subjectId },
      });
      await this.classSubjectRepo.save(cs);
    }
  }

  async create(params: {
    name: string;
    description?: string;
    level?: string;
    section?: string;
    room_id?: string;
    subject_ids?: string[];
  }): Promise<Class> {
    const name = params.name.trim();
    const exists = await this.classRepo.findOne({ where: { name } });
    if (exists) {
      throw new BadRequestException('Class name already exists');
    }
    const room = await this.resolveRoom(params.room_id);
    const cls = this.classRepo.create({
      name,
      description: params.description?.trim(),
      level: params.level?.trim(),
      section: params.section,
      room,
      active: true,
    });
    const saved = await this.classRepo.save(cls);
    if (params.subject_ids?.length) {
      await this.setClassSubjects(saved.id, params.subject_ids);
    }
    return saved;
  }

  async update(
    id: string,
    params: {
      name?: string;
      description?: string;
      level?: string;
      section?: string;
      room_id?: string;
      active?: boolean;
      subject_ids?: string[];
    },
  ): Promise<Class> {
    const cls = await this.classRepo.findOne({
      where: { id },
      relations: ['room'],
    });
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    if (params.name !== undefined) {
      const name = params.name.trim();
      const exists = await this.classRepo.findOne({ where: { name } });
      if (exists && exists.id !== id) {
        throw new BadRequestException('Class name already exists');
      }
      cls.name = name;
    }
    if (params.description !== undefined) {
      cls.description = params.description.trim() || undefined;
    }
    if (params.level !== undefined) cls.level = params.level.trim() || undefined;
    if (params.section !== undefined) cls.section = params.section;
    if (params.room_id !== undefined) {
      cls.room = (await this.resolveRoom(params.room_id)) ?? (null as unknown as Room);
    }
    if (params.active !== undefined) cls.active = params.active;
    if (params.subject_ids !== undefined) {
      await this.setClassSubjects(id, params.subject_ids);
    }
    return this.classRepo.save(cls);
  }

  async delete(id: string): Promise<void> {
    const cls = await this.classRepo.findOne({
      where: { id },
      relations: ['students'],
    });
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    if (cls.students?.length > 0) {
      throw new BadRequestException(
        `Cannot delete: ${cls.students.length} student(s) in this class. Reassign them first.`,
      );
    }
    await this.classRepo.remove(cls);
  }
}
