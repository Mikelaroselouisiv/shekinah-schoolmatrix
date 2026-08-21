import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';

@Controller('teachers')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
@DenyParents()
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  /** Classes que le professeur connecté enseigne (pour saisie des notes). */
  @Get('me/classes')
  async myClasses(@Req() req: { user?: { userId?: number; sub?: number; id?: number } }) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié');
    await this.teachersService.findOneTeacher(userId as number);
    const classes = await this.teachersService.getTeacherClassesForGrades(userId as number);
    return { ok: true, classes };
  }

  /** Matières que le professeur connecté enseigne dans cette classe (pour saisie des notes). */
  @Get('me/classes/:classId/subjects')
  async mySubjectsInClass(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Param('classId') classId: string,
  ) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié');
    await this.teachersService.findOneTeacher(userId as number);
    const subjects = await this.teachersService.getTeacherSubjectsInClass(
      userId as number,
      classId,
    );
    return { ok: true, subjects };
  }

  @Get()
  async list(
    @Query('class_id') classId?: string,
    @Query('subject_id') subjectId?: string,
  ) {
    const teachers =
      await this.teachersService.findTeachersForClassAndSubject(classId, subjectId);
    return {
      ok: true,
      teachers: teachers.map((t) => ({
        id: t.id,
        first_name: t.first_name,
        last_name: t.last_name,
        email: t.email,
        phone: t.phone,
        active: t.active,
      })),
    };
  }

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number) {
    const teacher = await this.teachersService.findOneTeacher(id);
    const classes = await this.teachersService.getTeacherClasses(id);
    const subjects = await this.teachersService.getTeacherSubjects(id);
    const class_subjects = await this.teachersService.getTeacherClassSubjects(id);
    const slots = await this.teachersService.getScheduleSlots({ teacher_id: id });
    return {
      ok: true,
      teacher: {
        id: teacher.id,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        email: teacher.email,
        phone: teacher.phone,
        active: teacher.active,
        classes,
        subjects,
        class_subjects,
        schedule_slots: slots,
      },
    };
  }

  @Get(':id/class-subjects')
  async getClassSubjects(@Param('id', ParseIntPipe) id: number) {
    const list = await this.teachersService.getTeacherClassSubjects(id);
    return { ok: true, class_subjects: list };
  }

  @Post(':id/class-subjects')
  async addClassSubject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { class_id: string; subject_id: string; room_id: string },
  ) {
    if (!body?.class_id || !body?.subject_id || !body?.room_id) {
      throw new BadRequestException('class_id, room_id et subject_id requis');
    }
    const assignment = await this.teachersService.addTeacherClassSubject(
      id,
      body.class_id,
      body.subject_id,
      body.room_id,
    );
    return {
      ok: true,
      assignment: {
        id: assignment.id,
        class_id: assignment.class_id ?? (assignment as any).class?.id,
        subject_id: assignment.subject_id ?? (assignment as any).subject?.id,
        room_id: assignment.room_id ?? (assignment as any).room?.id,
        created_at: assignment.created_at,
      },
    };
  }

  @Delete(':id/class-subjects/:assignmentId')
  async removeClassSubject(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId') assignmentId: string,
  ) {
    await this.teachersService.removeTeacherClassSubject(id, assignmentId);
    return { ok: true, deleted: true };
  }

  @Get(':id/classes')
  async getClasses(@Param('id', ParseIntPipe) id: number) {
    const classes = await this.teachersService.getTeacherClasses(id);
    return { ok: true, classes };
  }

  @Post(':id/classes')
  async addClass(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { class_id: string; is_main?: boolean },
  ) {
    const assignment = await this.teachersService.addClassTeacher(
      id,
      body.class_id,
      body.is_main ?? false,
    );
    return {
      ok: true,
      assignment: {
        id: assignment.id,
        class_id: assignment.class?.id ?? assignment.class_id,
        is_main: assignment.is_main,
        created_at: assignment.created_at,
      },
    };
  }

  @Delete(':id/classes/:classId')
  async removeClass(
    @Param('id', ParseIntPipe) id: number,
    @Param('classId') classId: string,
  ) {
    await this.teachersService.removeClassTeacher(id, classId);
    return { ok: true, deleted: true };
  }

  @Get(':id/subjects')
  async getSubjects(@Param('id', ParseIntPipe) id: number) {
    const subjects = await this.teachersService.getTeacherSubjects(id);
    return { ok: true, subjects };
  }

  @Post(':id/subjects')
  async addSubject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { subject_id: string },
  ) {
    const assignment = await this.teachersService.addTeacherSubject(
      id,
      body.subject_id,
    );
    return {
      ok: true,
      assignment: {
        id: assignment.id,
        subject_id: assignment.subject?.id ?? (assignment as any).subject_id,
        created_at: assignment.created_at,
      },
    };
  }

  @Delete(':id/subjects/:subjectId')
  async removeSubject(
    @Param('id', ParseIntPipe) id: number,
    @Param('subjectId') subjectId: string,
  ) {
    await this.teachersService.removeTeacherSubject(id, subjectId);
    return { ok: true, deleted: true };
  }
}
