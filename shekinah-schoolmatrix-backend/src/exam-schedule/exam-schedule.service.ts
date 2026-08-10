import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSchedule } from './exam-schedule.entity';
import { Class } from '../classes/class.entity';
import { Subject } from '../subjects/subject.entity';

@Injectable()
export class ExamScheduleService {
  constructor(
    @InjectRepository(ExamSchedule)
    private readonly repo: Repository<ExamSchedule>,
  ) {}

  async findAll(filters: {
    class_id?: string;
    subject_id?: string;
    period?: string;
  } = {}) {
    const qb = this.repo
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.class', 'class')
      .leftJoinAndSelect('exam.subject', 'subject')
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
    if (filters.period) {
      qb.andWhere('exam.period = :period', { period: filters.period });
    }
    const list = await qb.getMany();
    return list.map((e) => ({
      id: e.id,
      class_id: e.class?.id,
      class_name: e.class?.name,
      subject_id: e.subject?.id,
      subject_name: e.subject?.name,
      period: e.period,
      exam_date: e.exam_date,
      start_time: e.start_time,
      end_time: e.end_time,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }));
  }

  async findOne(id: string) {
    const exam = await this.repo.findOne({
      where: { id },
      relations: ['class', 'subject'],
    });
    if (!exam) throw new NotFoundException('Exam schedule not found');
    return {
      id: exam.id,
      class_id: exam.class?.id,
      class_name: exam.class?.name,
      subject_id: exam.subject?.id,
      subject_name: exam.subject?.name,
      period: exam.period,
      exam_date: exam.exam_date,
      start_time: exam.start_time,
      end_time: exam.end_time,
      created_at: exam.created_at,
      updated_at: exam.updated_at,
    };
  }

  async create(params: {
    class_id: string;
    subject_id: string;
    period: string;
    exam_date: string;
    start_time: string;
    end_time: string;
  }): Promise<ExamSchedule> {
    const exam = this.repo.create({
      class: { id: params.class_id },
      subject: { id: params.subject_id },
      period: params.period.trim(),
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
      exam_date: string;
      start_time: string;
      end_time: string;
    }>,
  ): Promise<ExamSchedule> {
    const exam = await this.repo.findOne({
      where: { id },
      relations: ['class', 'subject'],
    });
    if (!exam) throw new NotFoundException('Exam schedule not found');
    if (params.class_id !== undefined) exam.class = { id: params.class_id } as Class;
    if (params.subject_id !== undefined) exam.subject = { id: params.subject_id } as Subject;
    if (params.period !== undefined) exam.period = params.period.trim();
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
