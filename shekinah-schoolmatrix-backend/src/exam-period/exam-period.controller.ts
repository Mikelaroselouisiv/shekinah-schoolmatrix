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
  BadRequestException,
} from '@nestjs/common';
import { ExamPeriodService } from './exam-period.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';

@Controller('exam-periods')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class ExamPeriodController {
  constructor(private readonly examPeriodService: ExamPeriodService) {}

  @Get()
  async list(
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
  ) {
    const list = await this.examPeriodService.findAll({
      academic_year_id: academicYearId,
      class_id: classId,
    });
    return { ok: true, exam_periods: list };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const period = await this.examPeriodService.findOne(id);
    return { ok: true, exam_period: period };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      academic_year_id: string;
      class_id?: string;
      class_ids?: string[];
      period_name: string;
      start_date: string;
      end_date: string;
      report_date?: string | null;
    },
  ) {
    const classIds = body.class_ids?.filter(Boolean) ?? [];
    if (classIds.length > 0) {
      const created = await this.examPeriodService.createForClasses({
        academic_year_id: body.academic_year_id,
        class_ids: classIds,
        period_name: body.period_name,
        start_date: body.start_date,
        end_date: body.end_date,
        report_date: body.report_date ?? null,
      });
      return { ok: true, exam_periods: created, count: created.length };
    }
    if (body.class_id) {
      const created = await this.examPeriodService.create({
        academic_year_id: body.academic_year_id,
        class_id: body.class_id,
        period_name: body.period_name,
        start_date: body.start_date,
        end_date: body.end_date,
        report_date: body.report_date ?? null,
      });
      return { ok: true, exam_period: created };
    }
    throw new BadRequestException('class_id or class_ids (array) required');
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      academic_year_id: string;
      class_id: string;
      period_name: string;
      start_date: string;
      end_date: string;
      report_date: string | null;
    }>,
  ) {
    const period = await this.examPeriodService.updateAndReturn(id, body);
    return { ok: true, exam_period: period };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.examPeriodService.delete(id);
    return { ok: true, deleted: true };
  }
}
