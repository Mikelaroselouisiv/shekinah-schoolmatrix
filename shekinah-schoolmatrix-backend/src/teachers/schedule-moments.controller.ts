import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { ScheduleMomentsService } from './schedule-moments.service';

@Controller('schedule-moments')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
@DenyParents()
export class ScheduleMomentsController {
  constructor(private readonly moments: ScheduleMomentsService) {}

  @Get()
  async list(
    @Query('class_id') classId?: string,
    @Query('academic_year') academicYear?: string,
    @Query('kind') kind?: string,
    @Query('day_of_week') dayOfWeek?: string,
  ) {
    const moments = await this.moments.listClassMoments({
      class_id: classId,
      academic_year: academicYear,
      kind,
      day_of_week: dayOfWeek != null && dayOfWeek !== '' ? Number(dayOfWeek) : undefined,
    });
    return { ok: true, schedule_moments: moments };
  }

  @Post()
  async create(
    @Body()
    body: {
      class_id: string;
      academic_year?: string;
      kind: string;
      days?: number[];
      day_of_week?: number;
      start_time: string;
      end_time: string;
      label?: string | null;
    },
  ) {
    const schedule_moments = await this.moments.createClassMoments(body);
    return { ok: true, schedule_moments };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      kind: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      label: string | null;
    }>,
  ) {
    const moment = await this.moments.updateClassMoment(id, body);
    return { ok: true, schedule_moment: moment };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.moments.deleteClassMoment(id);
    return { ok: true, deleted: true };
  }
}
