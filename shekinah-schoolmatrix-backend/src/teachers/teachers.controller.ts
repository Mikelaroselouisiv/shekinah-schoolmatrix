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

  /** Anniversaires (aujourd’hui / demain) des élèves des salles du professeur connecté. */
  @Get('me/upcoming-birthdays')
  async myUpcomingBirthdays(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
  ) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié');
    const data = await this.teachersService.getUpcomingBirthdaysForTeacher(userId as number);
    return { ok: true, ...data };
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

  @Patch('me/schedule-slots/:id/materials')
  async mySlotMaterials(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Param('id') id: string,
    @Body() body: { materials?: string | null },
  ) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié');
    const slot = await this.teachersService.updateMySlotMaterials(
      userId as number,
      id,
      body.materials ?? null,
    );
    return {
      ok: true,
      schedule_slot: {
        id: slot.id,
        materials: slot.materials ?? null,
        updated_at: slot.updated_at,
      },
    };
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
      teachers: teachers.map((t) => this.teachersService.serializeTeacher(t)),
    };
  }

  @Get('assignments')
  async assignments(
    @Query('class_id') classId?: string,
    @Query('room_id') roomId?: string,
  ) {
    const list = await this.teachersService.findClassSubjectAssignments({
      classId,
      roomId,
    });
    return { ok: true, assignments: list };
  }

  /** Comptes staff (hors professeur / parent) à promouvoir depuis le panneau classe. */
  @Get('staff-search')
  async staffSearch(@Query('q') q?: string) {
    const users = await this.teachersService.searchStaffCandidates(q);
    return {
      ok: true,
      users: users.map((u) => ({
        ...this.teachersService.serializeTeacher(u),
        role: u.role?.name ?? null,
      })),
    };
  }

  @Post()
  async create(
    @Body()
    body: {
      first_name?: string;
      last_name?: string;
      email: string;
      phone?: string;
      password: string;
      profile_photo_url?: string;
    },
  ) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Email et mot de passe requis');
    }
    const teacher = await this.teachersService.createTeacher(body);
    return { ok: true, teacher: this.teachersService.serializeTeacher(teacher) };
  }

  @Post('promote')
  async promote(@Body() body: { user_id?: number }) {
    if (!body?.user_id) throw new BadRequestException('user_id requis');
    const teacher = await this.teachersService.promoteToTeacher(body.user_id);
    return { ok: true, teacher: this.teachersService.serializeTeacher(teacher) };
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
        ...this.teachersService.serializeTeacher(teacher),
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
    @Body()
    body: {
      class_id: string;
      room_id: string;
      subject_id?: string;
      subject_ids?: string[];
    },
  ) {
    const subjectIds = [
      ...(body?.subject_ids ?? []),
      ...(body?.subject_id ? [body.subject_id] : []),
    ].filter(Boolean);
    if (!body?.class_id || !body?.room_id || subjectIds.length === 0) {
      throw new BadRequestException(
        'class_id, room_id et au moins une matière (subject_id / subject_ids) requis',
      );
    }
    if (subjectIds.length === 1) {
      const assignment = await this.teachersService.addTeacherClassSubject(
        id,
        body.class_id,
        subjectIds[0],
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
    const { created, skipped } = await this.teachersService.addTeacherClassSubjects(
      id,
      body.class_id,
      body.room_id,
      subjectIds,
    );
    return {
      ok: true,
      created: created.length,
      skipped: skipped.length,
      assignments: created.map((assignment) => ({
        id: assignment.id,
        class_id: assignment.class_id ?? (assignment as any).class?.id,
        subject_id: assignment.subject_id ?? (assignment as any).subject?.id,
        room_id: assignment.room_id ?? (assignment as any).room?.id,
        created_at: assignment.created_at,
      })),
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
