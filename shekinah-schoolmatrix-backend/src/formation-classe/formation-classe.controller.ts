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
import { FormationClasseService } from './formation-classe.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('formation-classe')
@UseGuards(JwtAuthGuard)
export class FormationClasseController {
  constructor(private readonly formationClasseService: FormationClasseService) {}

  @Get('students')
  async getClassStudents(
    @Query('academic_year_id') academicYearId: string,
    @Query('class_id') classId: string,
  ) {
    const students = await this.formationClasseService.getClassStudents(
      academicYearId,
      classId,
    );
    return { ok: true, students };
  }

  @Get('thresholds')
  async listThresholds(
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
  ) {
    const thresholds = await this.formationClasseService.findAllThresholds(
      academicYearId,
      classId,
    );
    return { ok: true, thresholds };
  }

  @Post('thresholds')
  async saveThreshold(
    @Body()
    body: {
      class_id: string;
      academic_year_id: string;
      min_average_admis: number;
      min_average_admis_ailleurs: number;
      min_average_redoubler: number;
      min_average_ajourne: number;
    },
  ) {
    const t = await this.formationClasseService.saveThreshold(body.class_id, body.academic_year_id, {
      min_average_admis: body.min_average_admis,
      min_average_admis_ailleurs: body.min_average_admis_ailleurs,
      min_average_redoubler: body.min_average_redoubler,
      min_average_ajourne: body.min_average_ajourne,
    });
    return {
      ok: true,
      threshold: {
        id: t.id,
        class_id: t.class?.id,
        academic_year_id: t.academic_year?.id,
        min_average_admis: Number(t.min_average_admis),
        min_average_admis_ailleurs: Number(t.min_average_admis_ailleurs),
        min_average_redoubler: Number(t.min_average_redoubler),
        min_average_ajourne: Number(t.min_average_ajourne),
      },
    };
  }

  @Post('compute-decisions')
  async computeDecisions(
    @Body()
    body: { academic_year_id: string; class_id: string },
  ) {
    const result = await this.formationClasseService.computeAndSetDecisions(
      body.academic_year_id,
      body.class_id,
    );
    return { ok: true, ...result };
  }

  @Patch('assignments/:id/decision')
  async setDecision(
    @Param('id') assignmentId: string,
    @Body() body: { decision: string },
  ) {
    const a = await this.formationClasseService.setDecision(
      assignmentId,
      body.decision,
    );
    return {
      ok: true,
      assignment: {
        id: a.id,
        decision: a.decision,
      },
    };
  }

  @Post('ensure-assignments')
  async ensureAssignments(
    @Body() body: { academic_year_id: string },
  ) {
    const result =
      await this.formationClasseService.ensureAssignmentsFromCurrentStudents(
        body.academic_year_id,
      );
    return { ok: true, ...result };
  }

  @Post('run-formation')
  async runFormation(
    @Body()
    body: { current_year_id: string; next_year_id: string },
  ) {
    const result =
      await this.formationClasseService.runFormationForNextYear(
        body.current_year_id,
        body.next_year_id,
      );
    return { ok: true, ...result };
  }

  @Post('add-student')
  async addStudent(
    @Body()
    body: { student_id: string; academic_year_id: string; class_id: string },
  ) {
    const a = await this.formationClasseService.addStudentToClass(
      body.student_id,
      body.academic_year_id,
      body.class_id,
    );
    return {
      ok: true,
      assignment: {
        id: a.id,
        student_id: a.student?.id,
        class_id: a.class?.id,
      },
    };
  }

  @Delete('assignments/:id')
  async removeStudent(@Param('id') assignmentId: string) {
    await this.formationClasseService.removeStudentFromClass(assignmentId);
    return { ok: true, deleted: true };
  }
}
