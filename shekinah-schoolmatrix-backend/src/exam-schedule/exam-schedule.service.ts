import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSchedule } from './exam-schedule.entity';
import { Class } from '../classes/class.entity';
import { Subject } from '../subjects/subject.entity';
import { Period } from '../period/period.entity';

@Injectable()
export class ExamScheduleService {
  constructor(
    @InjectRepository(ExamSchedule)
    private readonly repo: Repository<ExamSchedule>,
    @InjectRepository(Period)
    private readonly periodRepo: Repository<Period>,
  ) {}

  private toDto(e: ExamSchedule) {
    const period = e.period_ref;
    return {
      id: e.id,
      class_id: e.class?.id,
      class_name: e.class?.name,
      subject_id: e.subject?.id,
      subject_name: e.subject?.name,
      period_id: period?.id ?? null,
      period: period?.name ?? e.period,
      academic_year_id: period?.academic_year?.id ?? null,
      academic_year_name: period?.academic_year?.name ?? null,
      exam_date: e.exam_date,
      start_time: e.start_time,
      end_time: e.end_time,
      created_at: e.created_at,
      updated_at: e.updated_at,
    };
  }

  private async resolvePeriod(params: {
    period_id?: string;
    period?: string;
    academic_year_id?: string;
  }): Promise<Period> {
    if (params.period_id?.trim()) {
      const period = await this.periodRepo.findOne({
        where: { id: params.period_id.trim() },
        relations: ['academic_year'],
      });
      if (!period) throw new BadRequestException('Période introuvable');
      if (
        params.academic_year_id &&
        period.academic_year?.id &&
        period.academic_year.id !== params.academic_year_id
      ) {
        throw new BadRequestException(
          'Cette période n’appartient pas à l’année académique choisie',
        );
      }
      return period;
    }
    const name = params.period?.trim();
    if (!name) {
      throw new BadRequestException(
        'Choisissez une période de l’année académique',
      );
    }
    if (params.academic_year_id) {
      const period = await this.periodRepo.findOne({
        where: {
          name,
          academic_year: { id: params.academic_year_id },
        },
        relations: ['academic_year'],
      });
      if (period) return period;
    }
    const period = await this.periodRepo.findOne({
      where: { name },
      relations: ['academic_year'],
    });
    if (!period) {
      throw new BadRequestException(
        'Cette période n’existe pas. Créez-la d’abord pour l’année académique.',
      );
    }
    return period;
  }

  async findAll(
    filters: {
      class_id?: string;
      subject_id?: string;
      period?: string;
      period_id?: string;
      academic_year_id?: string;
    } = {},
  ) {
    const qb = this.repo
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.class', 'class')
      .leftJoinAndSelect('exam.subject', 'subject')
      .leftJoinAndSelect('exam.period_ref', 'period')
      .leftJoinAndSelect('period.academic_year', 'academic_year')
      .orderBy('exam.exam_date', 'ASC')
      .addOrderBy('exam.start_time', 'ASC');
    if (filters.class_id) {
      qb.andWhere('exam.class_id = :class_id', { class_id: filters.class_id });
    }
    if (filters.subject_id) {
      qb.andWhere('exam.subject_id = :subject_id', {
        subject_id: filters.subject_id,
      });
    }
    if (filters.period_id) {
      qb.andWhere('exam.period_id = :period_id', {
        period_id: filters.period_id,
      });
    } else if (filters.period) {
      qb.andWhere('(period.name = :period OR exam.period = :period)', {
        period: filters.period,
      });
    }
    if (filters.academic_year_id) {
      qb.andWhere('academic_year.id = :academic_year_id', {
        academic_year_id: filters.academic_year_id,
      });
    }
    const list = await qb.getMany();
    return list.map((e) => this.toDto(e));
  }

  async findOne(id: string) {
    const exam = await this.repo.findOne({
      where: { id },
      relations: ['class', 'subject', 'period_ref', 'period_ref.academic_year'],
    });
    if (!exam) throw new NotFoundException('Exam schedule not found');
    return this.toDto(exam);
  }

  async create(params: {
    class_id: string;
    subject_id: string;
    period?: string;
    period_id?: string;
    academic_year_id?: string;
    exam_date: string;
    start_time: string;
    end_time: string;
  }): Promise<ExamSchedule> {
    const period = await this.resolvePeriod(params);
    const exam = this.repo.create({
      class: { id: params.class_id },
      subject: { id: params.subject_id },
      period_ref: period,
      period: period.name,
      exam_date: params.exam_date,
      start_time: params.start_time,
      end_time: params.end_time,
    });
    return this.repo.save(exam);
  }

  async update(
    id: string,
    params: Partial<{
      class_id: string;
      subject_id: string;
      period: string;
      period_id: string;
      academic_year_id: string;
      exam_date: string;
      start_time: string;
      end_time: string;
    }>,
  ): Promise<ExamSchedule> {
    const exam = await this.repo.findOne({
      where: { id },
      relations: ['class', 'subject', 'period_ref', 'period_ref.academic_year'],
    });
    if (!exam) throw new NotFoundException('Exam schedule not found');
    if (params.class_id !== undefined) exam.class = { id: params.class_id } as Class;
    if (params.subject_id !== undefined)
      exam.subject = { id: params.subject_id } as Subject;
    if (params.period_id !== undefined || params.period !== undefined) {
      const period = await this.resolvePeriod({
        period_id: params.period_id,
        period: params.period,
        academic_year_id: params.academic_year_id,
      });
      exam.period_ref = period;
      exam.period = period.name;
    }
    if (params.exam_date !== undefined) exam.exam_date = params.exam_date;
    if (params.start_time !== undefined) exam.start_time = params.start_time;
    if (params.end_time !== undefined) exam.end_time = params.end_time;
    return this.repo.save(exam);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const exam = await this.repo.findOne({ where: { id } });
    if (!exam) throw new NotFoundException('Exam schedule not found');
    await this.repo.remove(exam);
    return { deleted: true };
  }
}
