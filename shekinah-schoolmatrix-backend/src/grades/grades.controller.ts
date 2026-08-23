import { Controller, Get, Post, Body, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { GradesService } from './grades.service';
import { PreschoolGradesService } from './preschool-grades.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import {
  DenyParents,
  ParentScopedStudent,
} from '../auth/parent-scope.decorator';
import { isTeacherRoleName } from '../roles/roles.constants';
import { LevelScopeService, type RequestActor } from '../auth/level-scope.service';

const STUDENT_QUERY = { in: 'query', key: 'student_id' } as const;

@Controller('grades')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class GradesController {
  constructor(
    private readonly gradesService: GradesService,
    private readonly preschoolGradesService: PreschoolGradesService,
    private readonly levelScope: LevelScopeService,
  ) {}

  @DenyParents()
  @Get('teacher-for-class-subject')
  async getTeacher(
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
  ) {
    const teacher = await this.gradesService.getTeacherForClassSubject(classId!, subjectId!);
    return { ok: true, teacher };
  }

  @DenyParents()
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

  @DenyParents()
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

  /** Grille de saisie : contient les notes de toute la classe. */
  @DenyParents()
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
    const can_edit = !isTeacherRoleName(role) || !hasExisting;
    return { ok: true, ...data, can_edit: !!can_edit };
  }

  @DenyParents()
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
    if (isTeacherRoleName(req.user?.role)) {
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

  @ParentScopedStudent(STUDENT_QUERY)
  @Get('student-exam-results')
  async studentExamResults(
    @Query('student_id') studentId?: string,
    @Query('academic_year_id') academicYearId?: string,
  ) {
    const data = await this.gradesService.getStudentExamResults(studentId!, academicYearId!);
    return { ok: true, ...data };
  }

  @DenyParents()
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
    const can_edit = !isTeacherRoleName(role) || !hasExisting;
    return { ok: true, ...data, can_edit: !!can_edit };
  }

  @DenyParents()
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
    if (isTeacherRoleName(req.user?.role)) {
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

  @ParentScopedStudent(STUDENT_QUERY)
  @Get('preschool/student-results')
  async getPreschoolStudentResults(
    @Query('student_id') studentId?: string,
    @Query('academic_year_id') academicYearId?: string,
  ) {
    const data = await this.preschoolGradesService.getStudentPreschoolResults(studentId!, academicYearId!);
    return { ok: true, ...data };
  }

  @ParentScopedStudent(STUDENT_QUERY)
  @Get()
  async list(
    @Req() req: { user?: RequestActor },
    @Query('academic_year_id') academicYearId?: string,
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
    @Query('period_id') periodId?: string,
    @Query('student_id') studentId?: string,
  ) {
    if (classId) await this.levelScope.assertClassAccess(req.user, classId);
    const list = await this.levelScope.filterByClassId(
      req.user,
      await this.gradesService.findGrades({
        academic_year_id: academicYearId,
        class_id: classId,
        subject_id: subjectId,
        period_id: periodId,
        student_id: studentId,
      }),
      (g) => g.class_id,
    );
    return { ok: true, grades: list };
  }
}
