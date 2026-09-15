import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { HomeworkService } from './homework.service';
import { HomeworkKind } from './homework-assignment.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import {
  DenyParents,
  ParentScopedStudent,
} from '../auth/parent-scope.decorator';
import { isTeacherRoleName } from '../roles/roles.constants';

type AuthReq = {
  user?: { userId?: number; sub?: number; id?: number; role?: string };
};

function userIdOf(req: AuthReq): number {
  const id = req.user?.userId ?? req.user?.sub ?? req.user?.id;
  if (!id) throw new ForbiddenException('Non authentifié');
  return id;
}

/**
 * Travaux de classe (devoirs / leçons).
 *
 * Site parent / WordPress : `GET /homework/student/:studentId`
 * avec JWT PARENT (élève lié) — notes en temps réel.
 */
@Controller('homework')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @ParentScopedStudent({ in: 'param', key: 'studentId' })
  @Get('student/:studentId')
  async forStudent(@Param('studentId') studentId: string) {
    const data = await this.homeworkService.listForStudent(studentId);
    return { ok: true, ...data };
  }

  @DenyParents()
  @Get()
  async list(
    @Req() req: AuthReq,
    @Query('class_id') classId?: string,
    @Query('kind') kind?: string,
    @Query('academic_year_id') academicYearId?: string,
  ) {
    const uid = userIdOf(req);
    const teacherOnly = isTeacherRoleName(req.user?.role);
    const list = await this.homeworkService.listForTeacher({
      teacherId: teacherOnly ? uid : undefined,
      class_id: classId,
      kind,
      academic_year_id: academicYearId,
    });
    return { ok: true, assignments: list };
  }

  @DenyParents()
  @Get(':id')
  async one(@Req() req: AuthReq, @Param('id') id: string) {
    const data = await this.homeworkService.getOneForTeacher(
      id,
      userIdOf(req),
      req.user?.role,
    );
    return { ok: true, assignment: data };
  }

  @DenyParents()
  @Post()
  async create(
    @Req() req: AuthReq,
    @Body()
    body: {
      kind: HomeworkKind;
      title: string;
      instructions?: string | null;
      due_date?: string | null;
      class_id: string;
      subject_id?: string | null;
      academic_year_id?: string | null;
    },
  ) {
    const assignment = await this.homeworkService.create(
      userIdOf(req),
      req.user?.role,
      body,
    );
    return { ok: true, assignment };
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      kind: HomeworkKind;
      title: string;
      instructions: string | null;
      due_date: string | null;
      subject_id: string | null;
    }>,
  ) {
    const assignment = await this.homeworkService.update(
      id,
      userIdOf(req),
      req.user?.role,
      body,
    );
    return { ok: true, assignment };
  }

  @DenyParents()
  @Delete(':id')
  async remove(@Req() req: AuthReq, @Param('id') id: string) {
    await this.homeworkService.remove(id, userIdOf(req), req.user?.role);
    return { ok: true, deleted: true };
  }

  @DenyParents()
  @Put(':id/grades')
  async grades(
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Body()
    body: {
      student_id?: string;
      score?: string | null;
      comment?: string | null;
      records?: { student_id: string; score?: string | null; comment?: string | null }[];
    },
  ) {
    const records =
      body.records ??
      (body.student_id
        ? [{ student_id: body.student_id, score: body.score, comment: body.comment }]
        : []);
    const assignment = await this.homeworkService.upsertGrades(
      id,
      userIdOf(req),
      req.user?.role,
      records,
    );
    return { ok: true, assignment };
  }
}
