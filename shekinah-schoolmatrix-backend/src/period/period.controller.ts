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
import { PeriodService } from './period.service';
import { Period } from './period.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { isPeriodScope } from '../roles/education-levels';

function toDto(p: Period) {
  return {
    id: p.id,
    name: p.name,
    order_index: p.order_index,
    scope: isPeriodScope(p.scope) ? p.scope : 'ECOLE',
    academic_year_id: p.academic_year?.id,
    academic_year_name: p.academic_year?.name,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

@Controller('periods')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class PeriodController {
  constructor(private readonly service: PeriodService) {}

  @Get()
  async list(
    @Query('academic_year_id') academicYearId?: string,
    @Query('scope') scope?: string,
  ) {
    if (!academicYearId) return { ok: true, periods: [] };
    const list = await this.service.findByAcademicYear(academicYearId, scope);
    return {
      ok: true,
      periods: list.map(toDto),
    };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const p = await this.service.findOne(id);
    return { ok: true, period: toDto(p) };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      academic_year_id: string;
      name: string;
      order_index?: number;
      scope?: string;
    },
  ) {
    const p = await this.service.create(body);
    return {
      ok: true,
      period: toDto(p),
    };
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; order_index?: number; scope?: string },
  ) {
    const p = await this.service.update(id, body);
    return { ok: true, period: toDto(p) };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { ok: true, deleted: true };
  }
}
