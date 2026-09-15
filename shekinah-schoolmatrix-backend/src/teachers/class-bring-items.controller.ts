import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import {
  ClassDayListDayBody,
  ScheduleMomentsService,
} from './schedule-moments.service';

@Controller(['class-day-lists', 'class-bring-items'])
@UseGuards(JwtAuthGuard, ParentScopeGuard)
@DenyParents()
export class ClassBringItemsController {
  constructor(private readonly moments: ScheduleMomentsService) {}

  @Get()
  async list(
    @Query('class_id') classId?: string,
    @Query('academic_year') academicYear?: string,
  ) {
    const catalog = await this.moments.listBringCatalog();
    if (!classId) return { ok: true, days: [], catalog };
    const days = await this.moments.listDayLists(classId, academicYear);
    return { ok: true, days, catalog };
  }

  @Put()
  async replace(
    @Body()
    body: {
      class_id: string;
      academic_year?: string | null;
      days?: ClassDayListDayBody[];
      lines?: string[];
    },
  ) {
    const days = await this.moments.replaceBringItems(body);
    const catalog = await this.moments.listBringCatalog();
    return { ok: true, days, catalog };
  }
}
