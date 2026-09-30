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
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';

@Controller('exam-schedules')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class ExamScheduleController {
  constructor(private readonly examScheduleService: ExamScheduleService) {}

  @Get()
  async list(
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
    @Query('period') period?: string,
    @Query('period_id') periodId?: string,
    @Query('academic_year_id') academicYearId?: string,
  ) {
    const list = await this.examScheduleService.findAll({
      class_id: classId,
      subject_id: subjectId,
      period,
      period_id: periodId,
      academic_year_id: academicYearId,
    });
    return { ok: true, exam_schedules: list };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const exam = await this.examScheduleService.findOne(id);
    return { ok: true, exam_schedule: exam };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      class_id: string;
      subject_id: string;
      period?: string;
      period_id?: string;
      academic_year_id?: string;
      exam_date: string;
      start_time: string;
      end_time: string;
    },
  ) {
    const saved = await this.examScheduleService.create({
      class_id: body.class_id,
      subject_id: body.subject_id,
      period: body.period,
      period_id: body.period_id,
      academic_year_id: body.academic_year_id,
      exam_date: body.exam_date,
      start_time: body.start_time,
      end_time: body.end_time,
    });
    const exam = await this.examScheduleService.findOne(saved.id);
    return { ok: true, exam_schedule: exam };
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      class_id: string;
      subject_id: string;
      period: string;
      period_id: string;
      academic_year_id: string;
      exam_date: string;
      start_time: string;
      end_time: string;
    }>,
  ) {
    await this.examScheduleService.update(id, body);
    const exam = await this.examScheduleService.findOne(id);
    return { ok: true, exam_schedule: exam };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.examScheduleService.delete(id);
    return { ok: true, deleted: true };
  }
}
