import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamPeriod } from './exam-period.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';
import { Period } from '../period/period.entity';
import { isoDate } from '../agenda/location';
import { periodScopeFromLevel } from '../roles/education-levels';

@Injectable()
export class ExamPeriodService {
  constructor(
    @InjectRepository(ExamPeriod)
    private readonly repo: Repository<ExamPeriod>,
    @InjectRepository(Period)
    private readonly periodRepo: Repository<Period>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
  ) {}

  private toDto(p: ExamPeriod) {
    const period = p.period_ref;
    return {
      id: p.id,
      academic_year_id: p.academic_year?.id,
      academic_year_name: p.academic_year?.name,
      class_id: p.class?.id,
      class_name: p.class?.name,
      class_level: p.class?.level ?? null,
      period_id: period?.id ?? null,
      period_name: period?.name ?? p.period_name,
      start_date: p.start_date,
      end_date: p.end_date,
      report_date: p.report_date,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }

  private async resolvePeriodForClass(params: {
    academic_year_id: string;
    class_id: string;
    period_id?: string;
    period_name?: string;
  }): Promise<Period> {
    const yearId = params.academic_year_id?.trim();
    if (!yearId) throw new BadRequestException('Année académique requise');
    const klass = await this.classRepo.findOne({ where: { id: params.class_id } });
    const scope = periodScopeFromLevel(klass?.level);

    let name = (params.period_name ?? '').trim();
    if (params.period_id?.trim()) {
      const chosen = await this.periodRepo.findOne({
        where: { id: params.period_id.trim() },
        relations: ['academic_year'],
      });
      if (!chosen) throw new BadRequestException('Période introuvable');
      if (chosen.academic_year?.id && chosen.academic_year.id !== yearId) {
        throw new BadRequestException(
          'Cette période n’appartient pas à l’année académique choisie',
        );
      }
      name = chosen.name;
    }
    if (!name) {
      throw new BadRequestException(
        'Choisissez une période de l’année académique',
      );
    }

    const scoped = await this.periodRepo.findOne({
      where: {
        name,
        scope,
        academic_year: { id: yearId },
      },
      relations: ['academic_year'],
    });
    if (scoped) return scoped;

    const any = await this.periodRepo.findOne({
      where: { name, academic_year: { id: yearId } },
      relations: ['academic_year'],
    });
    if (any) return any;

    throw new BadRequestException(
      'Cette période n’existe pas. Créez-la d’abord pour l’année académique.',
    );
  }

  async findAll(filters: { academic_year_id?: string; class_id?: string } = {}) {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.academic_year', 'year')
      .leftJoinAndSelect('p.class', 'class')
      .leftJoinAndSelect('p.period_ref', 'period')
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
      relations: ['academic_year', 'class', 'period_ref'],
    });
    if (!p) throw new NotFoundException('Période d’examens introuvable');
    return this.toDto(p);
  }

  async create(params: {
    academic_year_id: string;
    class_id: string;
    period_id?: string;
    period_name?: string;
    start_date: string;
    end_date: string;
    report_date?: string | null;
  }) {
    const period = await this.resolvePeriodForClass(params);
    const start = isoDate(params.start_date)!;
    const end = isoDate(params.end_date)!;
    if (end < start) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }
    const saved = await this.repo.save(
      this.repo.create({
        academic_year: { id: params.academic_year_id },
        class: { id: params.class_id },
        period_ref: period,
        period_name: period.name.slice(0, 80),
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
    period_id?: string;
    period_name?: string;
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
      period_id: string;
      period_name: string;
      start_date: string;
      end_date: string;
      report_date: string | null;
    }>,
  ) {
    const p = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class', 'period_ref'],
    });
    if (!p) throw new NotFoundException('Période d’examens introuvable');
    if (params.academic_year_id !== undefined) {
      p.academic_year = { id: params.academic_year_id } as AcademicYear;
    }
    if (params.class_id !== undefined) p.class = { id: params.class_id } as Class;
    if (
      params.period_id !== undefined ||
      params.period_name !== undefined ||
      params.academic_year_id !== undefined ||
      params.class_id !== undefined
    ) {
      const period = await this.resolvePeriodForClass({
        academic_year_id: p.academic_year.id,
        class_id: p.class.id,
        period_id: params.period_id,
        period_name: params.period_name ?? p.period_name,
      });
      p.period_ref = period;
      p.period_name = period.name.slice(0, 80);
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
