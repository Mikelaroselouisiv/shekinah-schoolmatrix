import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentMeeting } from './parent-meeting.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';
import { isoDate, normalizeLocation } from '../agenda/location';

@Injectable()
export class ParentMeetingService {
  constructor(
    @InjectRepository(ParentMeeting)
    private readonly repo: Repository<ParentMeeting>,
  ) {}

  private toDto(m: ParentMeeting) {
    const place = normalizeLocation(m.location_kind, m.location_text);
    return {
      id: m.id,
      academic_year_id: m.academic_year?.id,
      academic_year_name: m.academic_year?.name,
      meeting_date: m.meeting_date,
      start_time: m.start_time,
      class_id: m.class?.id,
      class_name: m.class?.name,
      objective: m.objective,
      location_kind: place.location_kind,
      location_text: place.location_text,
      location_label: place.location_label,
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  }

  async findAll(filters: { academic_year_id?: string; class_id?: string } = {}) {
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.academic_year', 'year')
      .leftJoinAndSelect('m.class', 'class')
      .orderBy('m.meeting_date', 'ASC')
      .addOrderBy('m.start_time', 'ASC');
    if (filters.academic_year_id) {
      qb.andWhere('m.academic_year_id = :aid', { aid: filters.academic_year_id });
    }
    if (filters.class_id) {
      qb.andWhere('m.class_id = :cid', { cid: filters.class_id });
    }
    const list = await qb.getMany();
    return list.map((m) => this.toDto(m));
  }

  async findOne(id: string) {
    const m = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class'],
    });
    if (!m) throw new NotFoundException('Réunion introuvable');
    return this.toDto(m);
  }

  async create(params: {
    academic_year_id: string;
    meeting_date: string;
    start_time: string;
    class_id: string;
    objective: string;
    location_kind?: string | null;
    location_text?: string | null;
  }) {
    const objective = (params.objective ?? '').trim();
    if (!objective) throw new BadRequestException('Objectif requis');
    const place = normalizeLocation(params.location_kind, params.location_text);
    const saved = await this.repo.save(
      this.repo.create({
        academic_year: { id: params.academic_year_id },
        meeting_date: isoDate(params.meeting_date)!,
        start_time: (params.start_time || '').slice(0, 5),
        class: { id: params.class_id },
        objective: objective.slice(0, 500),
        location_kind: place.location_kind,
        location_text: place.location_text,
      }),
    );
    return this.findOne(saved.id);
  }

  async createForClasses(params: {
    academic_year_id: string;
    meeting_date: string;
    start_time: string;
    class_ids: string[];
    objective: string;
    location_kind?: string | null;
    location_text?: string | null;
  }) {
    if (!params.class_ids?.length) return [];
    const created = [];
    for (const class_id of params.class_ids) {
      created.push(await this.create({ ...params, class_id }));
    }
    return created;
  }

  async updateAndReturn(
    id: string,
    params: Partial<{
      academic_year_id: string;
      meeting_date: string;
      start_time: string;
      class_id: string;
      objective: string;
      location_kind: string | null;
      location_text: string | null;
    }>,
  ) {
    const m = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class'],
    });
    if (!m) throw new NotFoundException('Réunion introuvable');
    if (params.academic_year_id !== undefined) {
      m.academic_year = { id: params.academic_year_id } as AcademicYear;
    }
    if (params.meeting_date !== undefined) m.meeting_date = isoDate(params.meeting_date)!;
    if (params.start_time !== undefined) m.start_time = params.start_time.slice(0, 5);
    if (params.class_id !== undefined) m.class = { id: params.class_id } as Class;
    if (params.objective !== undefined) {
      const objective = params.objective.trim();
      if (!objective) throw new BadRequestException('Objectif requis');
      m.objective = objective.slice(0, 500);
    }
    if (params.location_kind !== undefined || params.location_text !== undefined) {
      const place = normalizeLocation(
        params.location_kind ?? m.location_kind,
        params.location_text !== undefined ? params.location_text : m.location_text,
      );
      m.location_kind = place.location_kind;
      m.location_text = place.location_text;
    }
    await this.repo.save(m);
    return this.findOne(id);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException('Réunion introuvable');
    await this.repo.remove(m);
    return { deleted: true };
  }
}
