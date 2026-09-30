import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchoolVacation } from './school-vacation.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Room } from '../rooms/room.entity';

function isoDate(value?: string | null): string {
  const s = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestException('Date invalide');
  }
  return s;
}

function vacationKind(value?: string | null): 'VACANCE' | 'CONGE' {
  return String(value ?? '').toUpperCase() === 'CONGE' ? 'CONGE' : 'VACANCE';
}

@Injectable()
export class SchoolVacationService {
  constructor(
    @InjectRepository(SchoolVacation)
    private readonly repo: Repository<SchoolVacation>,
  ) {}

  private toDto(v: SchoolVacation) {
    return {
      id: v.id,
      academic_year_id: v.academic_year?.id,
      academic_year_name: v.academic_year?.name,
      start_date: v.start_date,
      end_date: v.end_date,
      motif: v.motif,
      kind: vacationKind(v.kind),
      room_id: v.room?.id ?? null,
      room_name: v.room?.name ?? null,
      class_id: v.room?.class?.id ?? null,
      class_name: v.room?.class?.name ?? null,
      created_at: v.created_at,
      updated_at: v.updated_at,
    };
  }

  private withRelations() {
    return this.repo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.academic_year', 'year')
      .leftJoinAndSelect('v.room', 'room')
      .leftJoinAndSelect('room.class', 'roomClass');
  }

  async findAll(filters: { academic_year_id?: string; room_id?: string } = {}) {
    const qb = this.withRelations()
      .orderBy('v.start_date', 'ASC')
      .addOrderBy('v.end_date', 'ASC');
    if (filters.academic_year_id) {
      qb.andWhere('v.academic_year_id = :aid', { aid: filters.academic_year_id });
    }
    if (filters.room_id) {
      qb.andWhere('v.room_id = :rid', { rid: filters.room_id });
    }
    const list = await qb.getMany();
    return list.map((v) => this.toDto(v));
  }

  async findOne(id: string) {
    const v = await this.withRelations().where('v.id = :id', { id }).getOne();
    if (!v) throw new NotFoundException('Période de vacances introuvable');
    return this.toDto(v);
  }

  async create(params: {
    academic_year_id: string;
    start_date: string;
    end_date: string;
    motif: string;
    kind?: string | null;
    room_id?: string | null;
  }) {
    const start = isoDate(params.start_date);
    const end = isoDate(params.end_date);
    if (end < start) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    const motif = (params.motif ?? '').trim();
    if (!motif) throw new BadRequestException('Motif requis');
    const saved = await this.repo.save(
      this.repo.create({
        academic_year: { id: params.academic_year_id },
        start_date: start,
        end_date: end,
        motif: motif.slice(0, 200),
        kind: vacationKind(params.kind),
        room: params.room_id ? ({ id: params.room_id } as Room) : null,
      }),
    );
    return this.findOne(saved.id);
  }

  async createForRooms(params: {
    academic_year_id: string;
    start_date: string;
    end_date: string;
    motif: string;
    kind?: string | null;
    room_ids: string[];
  }) {
    if (!params.room_ids?.length) return [];
    const created = [];
    for (const room_id of params.room_ids) {
      created.push(await this.create({ ...params, room_id }));
    }
    return created;
  }

  async updateAndReturn(
    id: string,
    params: Partial<{
      academic_year_id: string;
      start_date: string;
      end_date: string;
      motif: string;
      kind: string | null;
      room_id: string | null;
    }>,
  ) {
    const v = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'room', 'room.class'],
    });
    if (!v) throw new NotFoundException('Période de vacances introuvable');
    if (params.academic_year_id !== undefined) {
      v.academic_year = { id: params.academic_year_id } as AcademicYear;
    }
    if (params.start_date !== undefined) v.start_date = isoDate(params.start_date);
    if (params.end_date !== undefined) v.end_date = isoDate(params.end_date);
    if ((v.end_date || '') < (v.start_date || '')) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    if (params.motif !== undefined) {
      const motif = params.motif.trim();
      if (!motif) throw new BadRequestException('Motif requis');
      v.motif = motif.slice(0, 200);
    }
    if (params.kind !== undefined) v.kind = vacationKind(params.kind);
    if (params.room_id !== undefined) {
      v.room = params.room_id ? ({ id: params.room_id } as Room) : null;
    }
    await this.repo.save(v);
    return this.findOne(id);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const v = await this.repo.findOne({ where: { id } });
    if (!v) throw new NotFoundException('Période de vacances introuvable');
    await this.repo.remove(v);
    return { deleted: true };
  }
}
