import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AcademicYearService } from './academic-year.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('academic-years')
@UseGuards(JwtAuthGuard)
export class AcademicYearController {
  constructor(private readonly service: AcademicYearService) {}

  @Get()
  async list() {
    const list = await this.service.findAll();
    return { ok: true, academic_years: list };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const ay = await this.service.findOne(id);
    return { ok: true, academic_year: ay };
  }

  @Post()
  async create(@Body() body: { name: string; start_date?: string; end_date?: string }) {
    const ay = await this.service.create(body);
    return { ok: true, academic_year: ay };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{ name: string; start_date: string; end_date: string; active: boolean }>,
  ) {
    const ay = await this.service.update(id, body);
    return { ok: true, academic_year: ay };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { ok: true, deleted: true };
  }
}
