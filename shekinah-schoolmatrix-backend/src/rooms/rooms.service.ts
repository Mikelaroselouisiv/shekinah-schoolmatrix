import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './room.entity';
import { Class } from '../classes/class.entity';
import { Student } from '../students/student.entity';

export type RoomListItem = {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  class_id: string | null;
  class_name: string | null;
  student_count: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  private async toListItem(room: Room): Promise<RoomListItem> {
    const student_count = await this.studentRepo.count({
      where: { room: { id: room.id }, active: true },
    });
    return {
      id: room.id,
      name: room.name,
      description: room.description ?? null,
      capacity: room.capacity ?? null,
      class_id: room.class?.id ?? null,
      class_name: room.class?.name ?? null,
      student_count,
      active: room.active,
      created_at: room.created_at,
      updated_at: room.updated_at,
    };
  }

  async findAll(classId?: string): Promise<RoomListItem[]> {
    const qb = this.roomRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.class', 'c')
      .orderBy('c.name', 'ASC')
      .addOrderBy('r.name', 'ASC');
    if (classId) {
      qb.andWhere('r.class_id = :classId', { classId });
    }
    const rooms = await qb.getMany();
    return Promise.all(rooms.map((r) => this.toListItem(r)));
  }

  async findOne(id: string): Promise<RoomListItem> {
    const room = await this.roomRepo.findOne({
      where: { id },
      relations: ['class'],
    });
    if (!room) {
      throw new NotFoundException('Salle introuvable');
    }
    return this.toListItem(room);
  }

  async findEntity(id: string): Promise<Room> {
    const room = await this.roomRepo.findOne({
      where: { id },
      relations: ['class'],
    });
    if (!room) {
      throw new NotFoundException('Salle introuvable');
    }
    return room;
  }

  private parseCapacity(raw: unknown): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new BadRequestException(
        'La limite d’élèves doit être un entier ≥ 1 (ou vide pour illimité)',
      );
    }
    return Math.floor(n);
  }

  private async assertClass(classId: string | null | undefined): Promise<Class | null> {
    if (!classId) return null;
    const cls = await this.classRepo.findOne({ where: { id: classId } });
    if (!cls) {
      throw new BadRequestException('Classe introuvable');
    }
    return cls;
  }

  private async assertUniqueName(name: string, classId: string | null, excludeId?: string) {
    const qb = this.roomRepo
      .createQueryBuilder('r')
      .where('LOWER(r.name) = LOWER(:name)', { name });
    if (classId) {
      qb.andWhere('r.class_id = :classId', { classId });
    } else {
      qb.andWhere('r.class_id IS NULL');
    }
    if (excludeId) {
      qb.andWhere('r.id != :excludeId', { excludeId });
    }
    const exists = await qb.getOne();
    if (exists) {
      throw new BadRequestException(
        classId
          ? 'Ce nom de salle existe déjà pour cette classe'
          : 'Ce nom de salle existe déjà',
      );
    }
  }

  /**
   * Vérifie qu’on peut encore placer un élève dans la salle.
   * @returns true si OK
   */
  async assertCanAcceptStudent(
    roomId: string,
    excludeStudentId?: string,
  ): Promise<void> {
    const room = await this.findEntity(roomId);
    if (room.capacity == null) return;
    const qb = this.studentRepo
      .createQueryBuilder('s')
      .where('s.room_id = :roomId', { roomId })
      .andWhere('s.active = true');
    if (excludeStudentId) {
      qb.andWhere('s.id != :excludeStudentId', { excludeStudentId });
    }
    const count = await qb.getCount();
    if (count >= room.capacity) {
      throw new BadRequestException(
        `La salle « ${room.name} » est pleine (${room.capacity} élève${room.capacity > 1 ? 's' : ''} max)`,
      );
    }
  }

  async create(params: {
    name: string;
    description?: string;
    capacity?: number | null;
    class_id?: string | null;
  }): Promise<RoomListItem> {
    const name = (params.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('Le nom de la salle est requis');
    }
    const cls = await this.assertClass(params.class_id);
    if (!cls) {
      throw new BadRequestException(
        'La classe pédagogique est requise (ex. 1ère année fondamentale)',
      );
    }
    const capacity = this.parseCapacity(params.capacity);
    await this.assertUniqueName(name, cls.id);
    const room = this.roomRepo.create({
      name,
      description: params.description?.trim() || undefined,
      capacity,
      class: cls,
      active: true,
    });
    const saved = await this.roomRepo.save(room);
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    params: {
      name?: string;
      description?: string;
      capacity?: number | null;
      class_id?: string | null;
      active?: boolean;
    },
  ): Promise<RoomListItem> {
    const room = await this.findEntity(id);
    if (params.name !== undefined) {
      const name = params.name.trim();
      if (!name) {
        throw new BadRequestException('Le nom de la salle est requis');
      }
      room.name = name;
    }
    if (params.description !== undefined) {
      room.description = params.description.trim() || undefined;
    }
    if (params.capacity !== undefined) {
      const capacity = this.parseCapacity(params.capacity);
      if (capacity != null) {
        const student_count = await this.studentRepo.count({
          where: { room: { id: id }, active: true },
        });
        if (student_count > capacity) {
          throw new BadRequestException(
            `Impossible : ${student_count} élève(s) déjà inscrit(s), limite demandée ${capacity}`,
          );
        }
      }
      room.capacity = capacity;
    }
    if (params.class_id !== undefined) {
      const cls = await this.assertClass(params.class_id);
      if (!cls) {
        throw new BadRequestException('La classe pédagogique est requise');
      }
      room.class = cls;
    }
    if (params.active !== undefined) room.active = params.active;

    const classId = room.class?.id ?? null;
    await this.assertUniqueName(room.name, classId, id);
    await this.roomRepo.save(room);
    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    const room = await this.findEntity(id);
    const student_count = await this.studentRepo.count({
      where: { room: { id } },
    });
    if (student_count > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${student_count} élève(s) sont encore dans cette salle`,
      );
    }
    await this.roomRepo.remove(room);
  }
}
