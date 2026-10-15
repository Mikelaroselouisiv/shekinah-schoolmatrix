import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchoolVacation } from './school-vacation.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';

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
      class_id: v.class?.id ?? null,
      class_name: v.class?.name ?? null,
      created_at: v.created_at,
      updated_at: v.updated_at,
    };
  }

  private withRelations() {
    return this.repo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.academic_year', 'year')
      .leftJoinAndSelect('v.class', 'klass');
  }

  async findAll(filters: { academic_year_id?: string; class_id?: string } = {}) {
    const qb = this.withRelations()
      .orderBy('v.start_date', 'ASC')
      .addOrderBy('v.end_date', 'ASC');
    if (filters.academic_year_id) {
      qb.andWhere('v.academic_year_id = :aid', { aid: filters.academic_year_id });
    }
    if (filters.class_id) {
      qb.andWhere('(v.class_id = :cid OR v.class_id IS NULL)', {
        cid: filters.class_id,
      });
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
    class_id?: string | null;
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
        class: params.class_id ? ({ id: params.class_id } as Class) : null,
      }),
    );
    return this.findOne(saved.id);
  }

  async createForClasses(params: {
    academic_year_id: string;
    start_date: string;
    end_date: string;
    motif: string;
    kind?: string | null;
    class_ids: string[];
  }) {
    const ids = [...new Set((params.class_ids ?? []).filter(Boolean))];
    if (!ids.length) return [];
    const created = [];
    for (const class_id of ids) {
      created.push(await this.create({ ...params, class_id }));
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
      class_id: string | null;
    }>,
  ) {
    const v = await this.repo.findOne({
      where: { id },
      relations: ['academic_year', 'class'],
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
    if (params.class_id !== undefined) {
      v.class = params.class_id ? ({ id: params.class_id } as Class) : null;
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
