import { Controller, Get, Post, Body, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { GradesService } from './grades.service';
import { PreschoolGradesService } from './preschool-grades.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('grades')
@UseGuards(JwtAuthGuard)
export class GradesController {
  constructor(
    private readonly gradesService: GradesService,
    private readonly preschoolGradesService: PreschoolGradesService,
  ) {}

  @Get('teacher-for-class-subject')
  async getTeacher(
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
  ) {
    const teacher = await this.gradesService.getTeacherForClassSubject(classId!, subjectId!);
    return { ok: true, teacher };
  }

  @Get('coefficients')
  async listCoefficients(
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
  ) {
    const list = await this.gradesService.findAllCoefficients({
      academic_year_id: academicYearId,
      class_id: classId,
    });
    return { ok: true, coefficients: list };
  }

  @Post('coefficients')
  async setCoefficient(@Body() body: {
    academic_year_id: string;
    class_id: string;
    subject_id: string;
    coefficient: number;
  }) {
    const c = await this.gradesService.setCoefficient(body);
    return { ok: true, coefficient: c };
  }

  @Get('form-data')
  async getFormData(
    @Req() req: { user?: { role?: string } },
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
    @Query('period_id') periodId?: string,
  ) {
    const data = await this.gradesService.getGradesFormData({
      academic_year_id: academicYearId!,
      class_id: classId!,
      subject_id: subjectId!,
      period_id: periodId!,
    });
    const role = req.user?.role;
    const hasExisting = (data.rows?.length && data.rows.some((r: { grade_id?: string | null }) => r.grade_id)) ?? false;
    const can_edit = role !== 'TEACHER' || !hasExisting;
    return { ok: true, ...data, can_edit: !!can_edit };
  }

  @Post('save')
  async saveGrades(
    @Req() req: { user?: { role?: string } },
    @Body() body: {
      academic_year_id: string;
      class_id: string;
      subject_id: string;
      period_id: string;
      grades: { student_id: string; coefficient: number; grade_value: number | null; detail?: string }[];
    },
  ) {
    if (req.user?.role === 'TEACHER') {
      const hasExisting = await this.gradesService.hasExistingGrades({
        academic_year_id: body.academic_year_id,
        class_id: body.class_id,
        subject_id: body.subject_id,
        period_id: body.period_id,
      });
      if (hasExisting) {
        throw new ForbiddenException('Les notes ont déjà été enregistrées. Seul le directeur général peut les modifier.');
      }
    }
    await this.gradesService.saveGrades(body);
    return { ok: true };
  }

  @Get('student-exam-results')
  async studentExamResults(
    @Query('student_id') studentId?: string,
    @Query('academic_year_id') academicYearId?: string,
  ) {
    const data = await this.gradesService.getStudentExamResults(studentId!, academicYearId!);
    return { ok: true, ...data };
  }

  @Get('preschool/form-data')
  async getPreschoolFormData(
    @Req() req: { user?: { role?: string } },
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
    @Query('period_id') periodId?: string,
  ) {
    const data = await this.preschoolGradesService.getPreschoolFormData({
      academic_year_id: academicYearId!,
      class_id: classId!,
      subject_id: subjectId!,
      period_id: periodId!,
    });
    const role = req.user?.role;
    const hasExisting = (data.rows?.length && data.rows.some((r: { grade_id?: string | null }) => r.grade_id)) ?? false;
    const can_edit = role !== 'TEACHER' || !hasExisting;
    return { ok: true, ...data, can_edit: !!can_edit };
  }

  @Post('preschool/save')
  async savePreschoolGrades(
    @Req() req: { user?: { role?: string } },
    @Body() body: {
      academic_year_id: string;
      class_id: string;
      subject_id: string;
      period_id: string;
      grades: { student_id: string; level?: string; frequency?: string; observation?: string }[];
    },
  ) {
    if (req.user?.role === 'TEACHER') {
      const hasExisting = await this.preschoolGradesService.hasExistingPreschoolGrades({
        academic_year_id: body.academic_year_id,
        class_id: body.class_id,
        subject_id: body.subject_id,
        period_id: body.period_id,
      });
      if (hasExisting) {
        throw new ForbiddenException('Les notes ont déjà été enregistrées. Seul le directeur général peut les modifier.');
      }
    }
    await this.preschoolGradesService.savePreschoolGrades(body);
    return { ok: true };
  }

  @Get('preschool/student-results')
  async getPreschoolStudentResults(
    @Query('student_id') studentId?: string,
    @Query('academic_year_id') academicYearId?: string,
  ) {
    const data = await this.preschoolGradesService.getStudentPreschoolResults(studentId!, academicYearId!);
    return { ok: true, ...data };
  }

  @Get()
  async list(
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
    @Query('period_id') periodId?: string,
    @Query('student_id') studentId?: string,
  ) {
    const list = await this.gradesService.findGrades({
      academic_year_id: academicYearId,
      class_id: classId,
      subject_id: subjectId,
      period_id: periodId,
      student_id: studentId,
    });
    return { ok: true, grades: list };
  }
}
