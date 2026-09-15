import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicYear } from './academic-year.entity';

@Injectable()
export class AcademicYearService {
  constructor(
    @InjectRepository(AcademicYear)
    private readonly repo: Repository<AcademicYear>,
  ) {}

  async findAll(): Promise<AcademicYear[]> {
    return this.repo.find({ order: { name: 'DESC' } });
  }

  async findOne(id: string): Promise<AcademicYear> {
    const ay = await this.repo.findOne({
      where: { id },
      relations: ['periods'],
    });
    if (!ay) throw new NotFoundException('Academic year not found');
    return ay;
  }

  async create(params: {
    name: string;
    start_date?: string;
    end_date?: string;
  }): Promise<AcademicYear> {
    const name = params.name.trim();
    const existing = await this.repo.findOne({ where: { name } });
    if (existing) {
      throw new BadRequestException('Cette année académique existe déjà.');
    }
    const ay = this.repo.create({
      name,
      start_date: params.start_date?.trim(),
      end_date: params.end_date?.trim(),
      active: true,
    });
    return this.repo.save(ay);
  }

  async update(
    id: string,
    params: { name?: string; start_date?: string; end_date?: string; active?: boolean },
  ): Promise<AcademicYear> {
    const ay = await this.repo.findOne({ where: { id } });
    if (!ay) throw new NotFoundException('Academic year not found');
    if (params.name !== undefined) ay.name = params.name.trim();
    if (params.start_date !== undefined) {
      ay.start_date = params.start_date?.trim() || undefined;
    }
    if (params.end_date !== undefined) {
      ay.end_date = params.end_date?.trim() || undefined;
    }
    if (params.active !== undefined) ay.active = params.active;
    return this.repo.save(ay);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const ay = await this.repo.findOne({ where: { id } });
    if (!ay) throw new NotFoundException('Academic year not found');
    await this.repo.remove(ay);
    return { deleted: true };
  }
}
