import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { DenyParents } from '../auth/parent-scope.decorator';
import { StatisticsService } from './statistics.service';
import { TEACHER_ROLE_NAMES, ROLES_PEDAGOGIQUE } from '../roles/roles.constants';

@Controller('statistics')
@UseGuards(JwtAuthGuard, ParentScopeGuard, RolesGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @DenyParents()
  @Get('academic')
  @Roles(
    'SUPER_ADMIN',
    'DIRECTEUR_GENERAL',
    'DIRECTEUR_ADMINISTRATIF',
    'ADMINISTRATEUR',
    'SCHOOL_ADMIN',
    ...ROLES_PEDAGOGIQUE,
    ...TEACHER_ROLE_NAMES,
  )
  @Permissions('stats-academiques', 'full_access')
  async academic(
    @Req() req: { user?: { userId?: number; role?: string } },
    @Query('academic_year_id') academicYearId?: string,
    @Query('period_id') periodId?: string,
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
    @Query('teacher_id') teacherId?: string,
    @Query('room_id') roomId?: string,
  ) {
    const parsedTeacher = teacherId ? Number(teacherId) : undefined;
    const data = await this.statisticsService.getAcademicStats({
      academic_year_id: academicYearId,
      period_id: periodId,
      class_id: classId,
      subject_id: subjectId,
      teacher_id: Number.isFinite(parsedTeacher) ? parsedTeacher : undefined,
      room_id: roomId,
      viewer: { userId: req.user?.userId, role: req.user?.role },
    });
    return { ok: true, ...data };
  }

  @DenyParents()
  @Get('financial')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'DIRECTEUR_ADMINISTRATIF', 'ADMINISTRATEUR', 'SCHOOL_ADMIN', 'ECONOME')
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
