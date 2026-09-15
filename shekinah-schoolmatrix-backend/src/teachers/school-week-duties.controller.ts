import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import {
  MorningOpeningDayBody,
  ScheduleMomentsService,
} from './schedule-moments.service';

@Controller('school-week-duties')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
@DenyParents()
export class SchoolWeekDutiesController {
  constructor(private readonly moments: ScheduleMomentsService) {}

  @Get('staff')
  async staff() {
    const staff = await this.moments.listStaffOptions();
    return { ok: true, staff };
  }

  @Get()
  async list(
    @Query('academic_year') academicYear?: string,
    @Query('kind') kind?: string,
  ) {
    if (academicYear && !kind) {
      const opening = await this.moments.getOpeningProgram(academicYear);
      return { ok: true, ...opening };
    }
    const duties = await this.moments.listDuties({
      academic_year: academicYear,
      kind,
    });
    return { ok: true, school_week_duties: duties };
  }

  @Put()
  async upsert(
    @Body()
    body: {
      academic_year: string;
      days: MorningOpeningDayBody[];
      preschool_instructions?: string[];
      primary_instructions?: string[];
    },
  ) {
    const opening = await this.moments.upsertWeekDuties(body);
    return { ok: true, ...opening };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.moments.deleteDuty(id);
    return { ok: true, deleted: true };
  }
}
