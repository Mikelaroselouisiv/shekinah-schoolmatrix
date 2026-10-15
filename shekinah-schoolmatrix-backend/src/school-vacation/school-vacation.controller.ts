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
import { SchoolVacationService } from './school-vacation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';

@Controller('school-vacations')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class SchoolVacationController {
  constructor(private readonly schoolVacationService: SchoolVacationService) {}

  @Get()
  async list(
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
  ) {
    const list = await this.schoolVacationService.findAll({
      academic_year_id: academicYearId,
      class_id: classId,
    });
    return { ok: true, school_vacations: list };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const vacation = await this.schoolVacationService.findOne(id);
    return { ok: true, school_vacation: vacation };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      academic_year_id?: string;
      start_date?: string;
      end_date?: string;
      motif?: string;
      kind?: string | null;
      class_id?: string | null;
      class_ids?: string[];
    },
  ) {
    if (!body.academic_year_id || !body.start_date || !body.end_date || !body.motif) {
      throw new BadRequestException(
        'academic_year_id, start_date, end_date et motif requis',
      );
    }
    const classIds = body.class_ids?.filter(Boolean) ?? [];
    if (classIds.length > 0) {
      const created = await this.schoolVacationService.createForClasses({
        academic_year_id: body.academic_year_id,
        start_date: body.start_date,
        end_date: body.end_date,
        motif: body.motif,
        kind: body.kind ?? null,
        class_ids: classIds,
      });
      return { ok: true, school_vacations: created, count: created.length };
    }
    if (!body.class_id) {
      throw new BadRequestException('class_id or class_ids (array) required');
    }
    const vacation = await this.schoolVacationService.create({
      academic_year_id: body.academic_year_id,
      start_date: body.start_date,
      end_date: body.end_date,
      motif: body.motif,
      kind: body.kind ?? null,
      class_id: body.class_id,
    });
    return { ok: true, school_vacation: vacation };
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      academic_year_id: string;
      start_date: string;
      end_date: string;
      motif: string;
      kind: string | null;
      class_id: string | null;
    }>,
  ) {
    const vacation = await this.schoolVacationService.updateAndReturn(id, body);
    return { ok: true, school_vacation: vacation };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.schoolVacationService.delete(id);
    return { ok: true, deleted: true };
  }
}
