import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamPeriod } from './exam-period.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';
import { isoDate } from '../agenda/location';

@Injectable()
export class ExamPeriodService {
  constructor(
    @InjectRepository(ExamPeriod)
    private readonly repo: Repository<ExamPeriod>,
  ) {}

  private toDto(p: ExamPeriod) {
    return {
      id: p.id,
      academic_year_id: p.academic_year?.id,
      academic_year_name: p.academic_year?.name,
      class_id: p.class?.id,
      class_name: p.class?.name,
      class_level: p.class?.level ?? null,
      period_name: p.period_name,
      start_date: p.start_date,
      end_date: p.end_date,
      report_date: p.report_date,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }

  async findAll(filters: { academic_year_id?: string; class_id?: string } = {}) {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.academic_year', 'year')
      .leftJoinAndSelect('p.class', 'class')
      .orderBy('p.start_date', 'ASC')
      .addOrderBy('p.period_name', 'ASC');
    if (filters.academic_year_id) {
      qb.andWhere('p.academic_year_id = :aid', { aid: filters.academic_year_id });
    }
    if (filters.class_id) {
      qb.andWhere('p.class_id = :cid', { cid: filters.class_id });
    }
    const list = await qb.getMany();
    return list.map((p) => this.toDto(p));
  }

  async findOne(id: string) {
    const p = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class'],
    });
    if (!p) throw new NotFoundException('Période d’examens introuvable');
    return this.toDto(p);
  }

  async create(params: {
    academic_year_id: string;
    class_id: string;
    period_name: string;
    start_date: string;
    end_date: string;
    report_date?: string | null;
  }) {
    const period_name = (params.period_name ?? '').trim();
    if (!period_name) throw new BadRequestException('Période requise');
    const start = isoDate(params.start_date)!;
    const end = isoDate(params.end_date)!;
    if (end < start) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    const saved = await this.repo.save(
      this.repo.create({
        academic_year: { id: params.academic_year_id },
        class: { id: params.class_id },
        period_name: period_name.slice(0, 80),
        start_date: start,
        end_date: end,
        report_date: isoDate(params.report_date, false),
      }),
    );
    return this.findOne(saved.id);
  }

  async createForClasses(params: {
    academic_year_id: string;
    class_ids: string[];
    period_name: string;
    start_date: string;
    end_date: string;
    report_date?: string | null;
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
      class_id: string;
      period_name: string;
      start_date: string;
      end_date: string;
      report_date: string | null;
    }>,
  ) {
    const p = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class'],
    });
    if (!p) throw new NotFoundException('Période d’examens introuvable');
    if (params.academic_year_id !== undefined) {
      p.academic_year = { id: params.academic_year_id } as AcademicYear;
    }
    if (params.class_id !== undefined) p.class = { id: params.class_id } as Class;
    if (params.period_name !== undefined) {
      const name = params.period_name.trim();
      if (!name) throw new BadRequestException('Période requise');
      p.period_name = name.slice(0, 80);
    }
    if (params.start_date !== undefined) p.start_date = isoDate(params.start_date)!;
    if (params.end_date !== undefined) p.end_date = isoDate(params.end_date)!;
    if (p.end_date < p.start_date) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    if (params.report_date !== undefined) {
      p.report_date = isoDate(params.report_date, false);
    }
    await this.repo.save(p);
    return this.findOne(id);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Période d’examens introuvable');
    await this.repo.remove(p);
    return { deleted: true };
  }
}
