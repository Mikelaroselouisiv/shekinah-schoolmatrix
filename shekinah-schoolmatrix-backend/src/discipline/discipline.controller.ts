import { Controller, Get, Post, Delete, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { DisciplineService } from './discipline.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('discipline')
@UseGuards(JwtAuthGuard)
export class DisciplineController {
  constructor(private readonly disciplineService: DisciplineService) {}

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

  @Post('attendance')
  async setAttendance(@Body() body: { class_id: string; date: string; student_id: string; status: string }) {
    return this.disciplineService.setAttendance(body.class_id, body.date, body.student_id, body.status);
  }

  @Post('attendance/bulk')
  async setBulkAttendance(@Body() body: { class_id: string; date: string; records: { student_id: string; status: string }[] }) {
    return this.disciplineService.setBulkAttendance(body.class_id, body.date, body.records);
  }

  @Post('latenesses')
  async createLateness(@Body() body: { student_id: string; class_id: string; date: string; arrival_time: string }) {
    return this.disciplineService.createLateness(body.student_id, body.class_id, body.date, body.arrival_time);
  }

  @Get('latenesses')
  async listLatenesses(
    @Query('student_id') studentId?: string,
    @Query('class_id') classId?: string,
    @Query('date') date?: string,
  ) {
    return this.disciplineService.listLatenesses({ student_id: studentId, class_id: classId, date });
  }

  @Delete('latenesses/:id')
  async deleteLateness(@Param('id') id: string) {
    return this.disciplineService.deleteLateness(id);
  }

  @Post('deductions')
  async addDeduction(@Body() body: { student_id: string; points_deducted: number; reason?: string }) {
    return this.disciplineService.addDeduction(body.student_id, body.points_deducted, body.reason);
  }

  @Get('deductions')
  async listDeductions(@Query('student_id') studentId?: string) {
    return this.disciplineService.listDeductions(studentId);
  }

  @Delete('deductions/:id')
  async deleteDeduction(@Param('id') id: string) {
    return this.disciplineService.deleteDeduction(id);
  }

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

  @Get('measures')
  async listMeasures(@Query('student_id') studentId?: string) {
    return this.disciplineService.listMeasures(studentId);
  }

  @Delete('measures/:id')
  async deleteMeasure(@Param('id') id: string) {
    return this.disciplineService.deleteMeasure(id);
  }

  @Put('measures/:id')
  async updateMeasure(
    @Param('id') id: string,
    @Body() body: { reason?: string; duration_days?: number },
  ) {
    return this.disciplineService.updateMeasure(id, body);
  }

  @Get('student-summary/:studentId')
  async getStudentSummary(@Param('studentId') studentId: string) {
    return this.disciplineService.getStudentDisciplineSummary(studentId);
  }
}
