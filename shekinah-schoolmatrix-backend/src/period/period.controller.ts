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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('periods')
@UseGuards(JwtAuthGuard)
export class PeriodController {
  constructor(private readonly service: PeriodService) {}

  @Get()
  async list(@Query('academic_year_id') academicYearId?: string) {
    if (!academicYearId) return { ok: true, periods: [] };
    const list = await this.service.findByAcademicYear(academicYearId);
    return {
      ok: true,
      periods: list.map((p) => ({
        id: p.id,
        name: p.name,
        order_index: p.order_index,
        academic_year_id: p.academic_year?.id,
        academic_year_name: p.academic_year?.name,
        created_at: p.created_at,
      })),
    };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const p = await this.service.findOne(id);
    return { ok: true, period: p };
  }

  @Post()
  async create(
    @Body() body: { academic_year_id: string; name: string; order_index?: number },
  ) {
    const p = await this.service.create(body);
    return {
      ok: true,
      period: {
        id: p.id,
        name: p.name,
        order_index: p.order_index,
        academic_year_id: p.academic_year?.id ?? (p as any).academic_year_id,
      },
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; order_index?: number },
  ) {
    const p = await this.service.update(id, body);
    return { ok: true, period: p };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { ok: true, deleted: true };
  }
}
