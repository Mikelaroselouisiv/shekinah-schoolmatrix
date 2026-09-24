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
import { ParentMeetingService } from './parent-meeting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';

@Controller('parent-meetings')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class ParentMeetingController {
  constructor(private readonly parentMeetingService: ParentMeetingService) {}

  @Get()
  async list(
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
  ) {
    const list = await this.parentMeetingService.findAll({
      academic_year_id: academicYearId,
      class_id: classId,
    });
    return { ok: true, parent_meetings: list };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const meeting = await this.parentMeetingService.findOne(id);
    return { ok: true, parent_meeting: meeting };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      academic_year_id: string;
      meeting_date: string;
      start_time: string;
      class_id?: string;
      class_ids?: string[];
      objective: string;
      location_kind?: string | null;
      location_text?: string | null;
    },
  ) {
    const classIds = body.class_ids?.filter(Boolean) ?? [];
    if (classIds.length > 0) {
      const created = await this.parentMeetingService.createForClasses({
        academic_year_id: body.academic_year_id,
        meeting_date: body.meeting_date,
        start_time: body.start_time,
        class_ids: classIds,
        objective: body.objective,
        location_kind: body.location_kind ?? null,
        location_text: body.location_text ?? null,
      });
      return { ok: true, parent_meetings: created, count: created.length };
    }
    if (body.class_id) {
      const created = await this.parentMeetingService.create({
        academic_year_id: body.academic_year_id,
        meeting_date: body.meeting_date,
        start_time: body.start_time,
        class_id: body.class_id,
        objective: body.objective,
        location_kind: body.location_kind ?? null,
        location_text: body.location_text ?? null,
      });
      return { ok: true, parent_meeting: created };
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
      meeting_date: string;
      start_time: string;
      class_id: string;
      objective: string;
      location_kind: string | null;
      location_text: string | null;
    }>,
  ) {
    const meeting = await this.parentMeetingService.updateAndReturn(id, body);
    return { ok: true, parent_meeting: meeting };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.parentMeetingService.delete(id);
    return { ok: true, deleted: true };
  }
}
