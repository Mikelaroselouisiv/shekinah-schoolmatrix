import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Period } from './period.entity';

@Injectable()
export class PeriodService {
  constructor(
    @InjectRepository(Period)
    private readonly repo: Repository<Period>,
  ) {}

  async findByAcademicYear(academicYearId: string): Promise<Period[]> {
    return this.repo.find({
      where: { academic_year: { id: academicYearId } },
      relations: ['academic_year'],
      order: { order_index: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Period> {
    const p = await this.repo.findOne({
      where: { id },
      relations: ['academic_year'],
    });
    if (!p) throw new NotFoundException('Period not found');
    return p;
  }

  async create(params: {
    academic_year_id: string;
    name: string;
    order_index?: number;
  }): Promise<Period> {
    const p = this.repo.create({
      academic_year: { id: params.academic_year_id },
      name: params.name.trim(),
      order_index: params.order_index ?? 0,
    });
    return this.repo.save(p);
  }

  async update(
    id: string,
    params: { name?: string; order_index?: number },
  ): Promise<Period> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Period not found');
    if (params.name !== undefined) p.name = params.name.trim();
    if (params.order_index !== undefined) p.order_index = params.order_index;
    return this.repo.save(p);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Period not found');
    await this.repo.remove(p);
    return { deleted: true };
  }
}
