import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExamScheduleService } from './exam-schedule.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('exam-schedules')
@UseGuards(JwtAuthGuard)
export class ExamScheduleController {
  constructor(private readonly examScheduleService: ExamScheduleService) {}

  @Get()
  async list(
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
    @Query('period') period?: string,
  ) {
    const list = await this.examScheduleService.findAll({
      class_id: classId,
      subject_id: subjectId,
      period,
    });
    return { ok: true, exam_schedules: list };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const exam = await this.examScheduleService.findOne(id);
    return { ok: true, exam_schedule: exam };
  }

  @Post()
  async create(
    @Body()
    body: {
      class_id: string;
      subject_id: string;
      period: string;
      exam_date: string;
      start_time: string;
      end_time: string;
    },
  ) {
    const exam = await this.examScheduleService.create({
      class_id: body.class_id,
      subject_id: body.subject_id,
      period: body.period,
      exam_date: body.exam_date,
      start_time: body.start_time,
      end_time: body.end_time,
    });
    return {
      ok: true,
      exam_schedule: {
        id: exam.id,
        class_id: exam.class?.id ?? (exam as any).class_id,
        subject_id: exam.subject?.id ?? (exam as any).subject_id,
        period: exam.period,
        exam_date: exam.exam_date,
        start_time: exam.start_time,
        end_time: exam.end_time,
        created_at: exam.created_at,
      },
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      class_id: string;
      subject_id: string;
      period: string;
      exam_date: string;
      start_time: string;
      end_time: string;
    }>,
  ) {
    const exam = await this.examScheduleService.update(id, body);
    return { ok: true, exam_schedule: exam };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.examScheduleService.delete(id);
    return { ok: true, deleted: true };
  }
}
