import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtracurricularActivity } from './extracurricular-activity.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';

@Injectable()
export class ExtracurricularActivityService {
  constructor(
    @InjectRepository(ExtracurricularActivity)
    private readonly repo: Repository<ExtracurricularActivity>,
  ) {}

  async findAll(filters: {
    academic_year_id?: string;
    class_id?: string;
  } = {}) {
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.academic_year', 'year')
      .leftJoinAndSelect('a.class', 'class')
      .orderBy('a.activity_date', 'ASC')
      .addOrderBy('a.start_time', 'ASC');
    if (filters.academic_year_id) {
      qb.andWhere('a.academic_year_id = :aid', {
        aid: filters.academic_year_id,
      });
    }
    if (filters.class_id) {
      qb.andWhere('a.class_id = :cid', { cid: filters.class_id });
    }
    const list = await qb.getMany();
    return list.map((a) => ({
      id: a.id,
      academic_year_id: a.academic_year?.id,
      academic_year_name: a.academic_year?.name,
      activity_date: a.activity_date,
      start_time: a.start_time,
      end_time: a.end_time,
      class_id: a.class?.id,
      class_name: a.class?.name,
      occasion: a.occasion,
      participation_fee: a.participation_fee,
      dress_code: a.dress_code,
      created_at: a.created_at,
      updated_at: a.updated_at,
    }));
  }

  async findOne(id: string) {
    const a = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class'],
    });
    if (!a) throw new NotFoundException('Extracurricular activity not found');
    return {
      id: a.id,
      academic_year_id: a.academic_year?.id,
      academic_year_name: a.academic_year?.name,
      activity_date: a.activity_date,
      start_time: a.start_time,
      end_time: a.end_time,
      class_id: a.class?.id,
      class_name: a.class?.name,
      occasion: a.occasion,
      participation_fee: a.participation_fee,
      dress_code: a.dress_code,
      created_at: a.created_at,
      updated_at: a.updated_at,
    };
  }

  async create(params: {
    academic_year_id: string;
    activity_date: string;
    start_time: string;
    end_time: string;
    class_id: string;
    occasion: string;
    participation_fee?: string | null;
    dress_code?: string | null;
  }) {
    const a = this.repo.create({
      academic_year: { id: params.academic_year_id },
      activity_date: params.activity_date,
      start_time: params.start_time,
      end_time: params.end_time,
      class: { id: params.class_id },
      occasion: params.occasion.trim(),
      participation_fee: params.participation_fee?.trim() || null,
      dress_code: params.dress_code?.trim() || null,
    });
    const saved = await this.repo.save(a);
    return this.findOne(saved.id);
  }

  async createForClasses(params: {
    academic_year_id: string;
    activity_date: string;
    start_time: string;
    end_time: string;
    class_ids: string[];
    occasion: string;
    participation_fee?: string | null;
    dress_code?: string | null;
  }) {
    if (!params.class_ids?.length) return [];
    const created = [];
    for (const class_id of params.class_ids) {
      const one = await this.create({
        academic_year_id: params.academic_year_id,
        activity_date: params.activity_date,
        start_time: params.start_time,
        end_time: params.end_time,
        class_id,
        occasion: params.occasion,
        participation_fee: params.participation_fee ?? null,
        dress_code: params.dress_code ?? null,
      });
      created.push(one);
    }
    return created;
  }

  async updateAndReturn(
    id: string,
    params: Partial<{
      academic_year_id: string;
      activity_date: string;
      start_time: string;
      end_time: string;
      class_id: string;
      occasion: string;
      participation_fee: string | null;
      dress_code: string | null;
    }>,
  ) {
    const a = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class'],
    });
    if (!a) throw new NotFoundException('Extracurricular activity not found');
    if (params.academic_year_id !== undefined) {
      a.academic_year = { id: params.academic_year_id } as AcademicYear;
    }
    if (params.activity_date !== undefined) a.activity_date = params.activity_date;
    if (params.start_time !== undefined) a.start_time = params.start_time;
    if (params.end_time !== undefined) a.end_time = params.end_time;
    if (params.class_id !== undefined) a.class = { id: params.class_id } as Class;
    if (params.occasion !== undefined) a.occasion = params.occasion.trim();
    if (params.participation_fee !== undefined) {
      a.participation_fee = params.participation_fee?.trim() || null;
    }
    if (params.dress_code !== undefined) {
      a.dress_code = params.dress_code?.trim() || null;
    }
    await this.repo.save(a);
    return this.findOne(id);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Extracurricular activity not found');
    await this.repo.remove(a);
    return { deleted: true };
  }
}
