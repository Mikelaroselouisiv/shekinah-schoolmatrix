import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from './subject.entity';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
  ) {}

  async findAll(): Promise<Subject[]> {
    return this.subjectRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Subject> {
    const subject = await this.subjectRepo.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  async create(params: { name: string; code?: string }): Promise<Subject> {
    const name = params.name.trim();
    const exists = await this.subjectRepo.findOne({ where: { name } });
    if (exists) {
      throw new BadRequestException('Subject name already exists');
    }
    const subject = this.subjectRepo.create({
      name,
      code: params.code?.trim(),
      active: true,
    });
    return this.subjectRepo.save(subject);
  }

  async update(
    id: string,
    params: { name?: string; code?: string; active?: boolean },
  ): Promise<Subject> {
    const subject = await this.subjectRepo.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (params.name !== undefined) {
      const name = params.name.trim();
      const exists = await this.subjectRepo.findOne({ where: { name } });
      if (exists && exists.id !== id) {
        throw new BadRequestException('Subject name already exists');
      }
      subject.name = name;
    }
    if (params.code !== undefined) subject.code = params.code.trim() || undefined;
    if (params.active !== undefined) subject.active = params.active;
    return this.subjectRepo.save(subject);
  }

  async delete(id: string): Promise<void> {
    const subject = await this.subjectRepo.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    await this.subjectRepo.remove(subject);
  }
}
