import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { ParentScopedStudent } from '../auth/parent-scope.decorator';

/**
 * Emploi du temps côté consultation.
 *
 * Contrôleur distinct de ScheduleSlotsController, qui porte @DenyParents() au
 * niveau classe : celui-ci est la seule porte ouverte aux parents, et elle est
 * fermée par ParentScopeGuard sur l'élève demandé.
 */
@Controller('schedule')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class StudentScheduleController {
  constructor(private readonly teachersService: TeachersService) {}

  /**
   * Emploi du temps de la classe de l'élève.
   * `day_of_week` : 0 = dimanche … 6 = samedi. Heures en "HH:MM".
   * Trié par jour puis par heure de début.
   */
  @ParentScopedStudent({ in: 'param', key: 'studentId' })
  @Get('student/:studentId')
  async forStudent(
    @Param('studentId') studentId: string,
    @Query('academic_year') academicYear?: string,
  ) {
    const data = await this.teachersService.getScheduleForStudent(
      studentId,
      academicYear?.trim() || undefined,
    );
    return { ok: true, ...data };
  }
}
