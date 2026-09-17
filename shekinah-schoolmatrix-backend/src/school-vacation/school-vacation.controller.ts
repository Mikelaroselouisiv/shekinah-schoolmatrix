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
  async list(@Query('academic_year_id') academicYearId?: string) {
    const list = await this.schoolVacationService.findAll({
      academic_year_id: academicYearId,
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
    },
  ) {
    if (!body.academic_year_id || !body.start_date || !body.end_date || !body.motif) {
      throw new BadRequestException(
        'academic_year_id, start_date, end_date et motif requis',
      );
    }
    const vacation = await this.schoolVacationService.create({
      academic_year_id: body.academic_year_id,
      start_date: body.start_date,
      end_date: body.end_date,
      motif: body.motif,
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
