import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { StatisticsService } from './statistics.service';

@Controller('statistics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('academic')
  @Roles(
    'SUPER_ADMIN',
    'DIRECTEUR_GENERAL',
    'SCHOOL_ADMIN',
    'DIRECTEUR_PEDAGOGIQUE',
    'CENSEUR',
  )
  @Permissions('stats-academiques', 'grades', 'classes', 'full_access')
  async academic(
    @Query('academic_year_id') academicYearId?: string,
    @Query('period_id') periodId?: string,
  ) {
    const data = await this.statisticsService.getAcademicStats({
      academic_year_id: academicYearId,
      period_id: periodId,
    });
    return { ok: true, ...data };
  }

  @Get('financial')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SCHOOL_ADMIN', 'ECONOME')
  @Permissions('stats-financieres', 'finance', 'economat', 'full_access')
  async financial(
    @Query('academic_year') academicYear?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    const data = await this.statisticsService.getFinancialStats({
      academic_year: academicYear,
      date_from: dateFrom,
      date_to: dateTo,
    });
    return { ok: true, ...data };
  }
}
