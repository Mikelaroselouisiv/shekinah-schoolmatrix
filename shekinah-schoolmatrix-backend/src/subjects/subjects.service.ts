import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from './subject.entity';
import { isSubjectAudience, type SubjectAudience } from '../roles/education-levels';

function normalizeAudience(value?: string | null): SubjectAudience {
  return isSubjectAudience(value) ? value : 'PRIMAIRE';
}

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
  ) {}

  async findAll(): Promise<Subject[]> {
    return this.subjectRepo
      .createQueryBuilder('s')
      .orderBy('s.audience', 'ASC')
      .addOrderBy('s.section', 'ASC', 'NULLS LAST')
      .addOrderBy('s.name', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<Subject> {
    const subject = await this.subjectRepo.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  async create(params: {
    name: string;
    code?: string;
    audience?: string;
    section?: string | null;
    preschool_eval?: string;
  }): Promise<Subject> {
    const name = params.name.trim();
    const audience = normalizeAudience(params.audience);
    const exists = await this.subjectRepo.findOne({ where: { name, audience } });
    if (exists) {
      throw new BadRequestException('Subject name already exists');
    }
    const subject = this.subjectRepo.create({
      name,
      code: params.code?.trim(),
      active: true,
      audience,
      section: audience === 'PRESCOLAIRE' ? params.section?.trim() || null : null,
      preschool_eval: params.preschool_eval === 'FREQUENCY' ? 'FREQUENCY' : 'LEVEL',
    });
    return this.subjectRepo.save(subject);
  }

  async update(
    id: string,
    params: {
      name?: string;
      code?: string;
      active?: boolean;
      audience?: string;
      section?: string | null;
      preschool_eval?: string;
    },
  ): Promise<Subject> {
    const subject = await this.subjectRepo.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    const audience =
      params.audience !== undefined
        ? normalizeAudience(params.audience)
        : normalizeAudience(subject.audience);
    if (params.name !== undefined || params.audience !== undefined) {
      const name = params.name !== undefined ? params.name.trim() : subject.name;
      const exists = await this.subjectRepo.findOne({ where: { name, audience } });
      if (exists && exists.id !== id) {
        throw new BadRequestException('Subject name already exists');
      }
      subject.name = name;
    }
    if (params.code !== undefined) subject.code = params.code.trim() || undefined;
    if (params.active !== undefined) subject.active = params.active;
    if (params.audience !== undefined) subject.audience = audience;
    if (params.section !== undefined || params.audience !== undefined) {
      subject.section =
        audience === 'PRESCOLAIRE'
          ? (params.section !== undefined ? params.section?.trim() || null : subject.section)
          : null;
    }
    if (params.preschool_eval !== undefined) {
      subject.preschool_eval = params.preschool_eval === 'FREQUENCY' ? 'FREQUENCY' : 'LEVEL';
    }
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
