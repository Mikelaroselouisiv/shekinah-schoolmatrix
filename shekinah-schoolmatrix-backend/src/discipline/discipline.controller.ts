import { Controller, Get, Post, Delete, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { DisciplineService } from './discipline.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import {
  DenyParents,
  ParentScopedStudent,
} from '../auth/parent-scope.decorator';

const STUDENT_QUERY = { in: 'query', key: 'student_id' } as const;

@Controller('discipline')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class DisciplineController {
  constructor(private readonly disciplineService: DisciplineService) {}

  /** Feuille de présence de toute la classe : outil enseignant, pas parent. */
  @DenyParents()
  @Get('attendance')
  async getAttendance(
    @Query('class_id') classId?: string,
    @Query('date') date?: string,
  ) {
    if (!classId || !date) {
      return { ok: true, class_id: classId, date, students: [] };
    }
    return this.disciplineService.getAttendanceByClassAndDate(classId, date);
  }

  /**
   * Présences d'UN élève sur une plage de dates (bornes incluses, YYYY-MM-DD).
   * Sans bornes : tout l'historique de l'élève.
   */
  @ParentScopedStudent({ in: 'param', key: 'studentId' })
  @Get('attendance/student/:studentId')
  async getStudentAttendance(
    @Param('studentId') studentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.disciplineService.getStudentAttendance(studentId, from, to);
  }

  @DenyParents()
  @Post('attendance')
  async setAttendance(@Body() body: { class_id: string; date: string; student_id: string; status: string }) {
    return this.disciplineService.setAttendance(body.class_id, body.date, body.student_id, body.status);
  }

  @DenyParents()
  @Post('attendance/bulk')
  async setBulkAttendance(@Body() body: { class_id: string; date: string; records: { student_id: string; status: string }[] }) {
    return this.disciplineService.setBulkAttendance(body.class_id, body.date, body.records);
  }

  @DenyParents()
  @Post('latenesses')
  async createLateness(@Body() body: { student_id: string; class_id: string; date: string; arrival_time: string }) {
    return this.disciplineService.createLateness(body.student_id, body.class_id, body.date, body.arrival_time);
  }

  @ParentScopedStudent(STUDENT_QUERY)
  @Get('latenesses')
  async listLatenesses(
    @Query('student_id') studentId?: string,
    @Query('class_id') classId?: string,
    @Query('date') date?: string,
  ) {
    return this.disciplineService.listLatenesses({ student_id: studentId, class_id: classId, date });
  }

  @DenyParents()
  @Delete('latenesses/:id')
  async deleteLateness(@Param('id') id: string) {
    return this.disciplineService.deleteLateness(id);
  }

  @DenyParents()
  @Post('deductions')
  async addDeduction(@Body() body: { student_id: string; points_deducted: number; reason?: string }) {
    return this.disciplineService.addDeduction(body.student_id, body.points_deducted, body.reason);
  }

  @ParentScopedStudent(STUDENT_QUERY)
  @Get('deductions')
  async listDeductions(@Query('student_id') studentId?: string) {
    return this.disciplineService.listDeductions(studentId);
  }

  @DenyParents()
  @Delete('deductions/:id')
  async deleteDeduction(@Param('id') id: string) {
    return this.disciplineService.deleteDeduction(id);
  }

  @DenyParents()
  @Post('measures')
  async addMeasure(
    @Body()
    body: {
      student_id: string;
      measure_type: string;
      reason?: string;
      duration_days?: number;
    },
  ) {
    return this.disciplineService.addMeasure(
      body.student_id,
      body.measure_type,
      body.reason,
      body.duration_days,
    );
  }

  @ParentScopedStudent(STUDENT_QUERY)
  @Get('measures')
  async listMeasures(@Query('student_id') studentId?: string) {
    return this.disciplineService.listMeasures(studentId);
  }

  @DenyParents()
  @Delete('measures/:id')
  async deleteMeasure(@Param('id') id: string) {
    return this.disciplineService.deleteMeasure(id);
  }

  @DenyParents()
  @Put('measures/:id')
  async updateMeasure(
    @Param('id') id: string,
    @Body() body: { reason?: string; duration_days?: number },
  ) {
    return this.disciplineService.updateMeasure(id, body);
  }

  @ParentScopedStudent({ in: 'param', key: 'studentId' })
  @Get('student-summary/:studentId')
  async getStudentSummary(@Param('studentId') studentId: string) {
    return this.disciplineService.getStudentDisciplineSummary(studentId);
  }
}
