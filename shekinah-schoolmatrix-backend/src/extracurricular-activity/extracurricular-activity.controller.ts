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
import { ExtracurricularActivityService } from './extracurricular-activity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';

@Controller('extracurricular-activities')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class ExtracurricularActivityController {
  constructor(
    private readonly extracurricularActivityService: ExtracurricularActivityService,
  ) {}

  @Get()
  async list(
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
  ) {
    const list = await this.extracurricularActivityService.findAll({
      academic_year_id: academicYearId,
      class_id: classId,
    });
    return { ok: true, extracurricular_activities: list };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const activity = await this.extracurricularActivityService.findOne(id);
    return { ok: true, extracurricular_activity: activity };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      academic_year_id: string;
      activity_date: string;
      start_time: string;
      end_time: string;
      class_id?: string;
      class_ids?: string[];
      occasion: string;
      objective?: string | null;
      parents_concerned?: boolean;
      participation_fee?: string | null;
      contribution_due_date?: string | null;
      dress_code?: string | null;
      location_kind?: string | null;
      location_text?: string | null;
    },
  ) {
    const classIds = body.class_ids?.filter(Boolean) ?? [];
    const extra = {
      objective: body.objective ?? null,
      parents_concerned: !!body.parents_concerned,
      participation_fee: body.participation_fee ?? null,
      contribution_due_date: body.contribution_due_date ?? null,
      dress_code: body.dress_code ?? null,
      location_kind: body.location_kind ?? null,
      location_text: body.location_text ?? null,
    };
    if (classIds.length > 0) {
      const created = await this.extracurricularActivityService.createForClasses({
        academic_year_id: body.academic_year_id,
        activity_date: body.activity_date,
        start_time: body.start_time,
        end_time: body.end_time,
        class_ids: classIds,
        occasion: body.occasion,
        ...extra,
      });
      return { ok: true, extracurricular_activities: created, count: created.length };
    }
    if (body.class_id) {
      const created = await this.extracurricularActivityService.create({
        academic_year_id: body.academic_year_id,
        activity_date: body.activity_date,
        start_time: body.start_time,
        end_time: body.end_time,
        class_id: body.class_id,
        occasion: body.occasion,
        ...extra,
      });
      return { ok: true, extracurricular_activity: created };
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
      activity_date: string;
      start_time: string;
      end_time: string;
      class_id: string;
      occasion: string;
      objective: string | null;
      parents_concerned: boolean;
      participation_fee: string | null;
      contribution_due_date: string | null;
      dress_code: string | null;
      location_kind: string | null;
      location_text: string | null;
    }>,
  ) {
    const activity =
      await this.extracurricularActivityService.updateAndReturn(id, body);
    return { ok: true, extracurricular_activity: activity };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.extracurricularActivityService.delete(id);
    return { ok: true, deleted: true };
  }
}
