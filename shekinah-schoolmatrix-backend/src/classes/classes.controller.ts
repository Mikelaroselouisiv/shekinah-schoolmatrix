import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { isPreschoolClass } from '../utils/preschool';
import { LevelScopeService, type RequestActor } from '../auth/level-scope.service';

@Controller('classes')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly levelScope: LevelScopeService,
  ) {}

  @Get()
  async list(@Req() req: { user?: RequestActor }) {
    const classes = await this.levelScope.filterClasses(
      req.user,
      await this.classesService.findAll(),
    );
    return {
      ok: true,
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        level: c.level,
        section: c.section,
        room_id: c.room?.id ?? null,
        room_name: c.room?.name ?? null,
        room_count: c.rooms?.length ?? 0,
        rooms: (c.rooms ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity ?? null,
        })),
        active: c.active,
        is_preschool: isPreschoolClass(c.description, c.level),
        created_at: c.created_at,
        updated_at: c.updated_at,
        student_count: c.students?.length ?? 0,
      })),
    };
  }

  /** Inclut la liste des élèves de la classe. */
  @DenyParents()
  @Get(':id')
  async one(@Param('id') id: string, @Req() req: { user?: RequestActor }) {
    await this.levelScope.assertClassAccess(req.user, id);
    const cls = await this.classesService.findOne(id);
    const subject_ids = await this.classesService.getClassSubjectIds(id);
    const is_preschool = isPreschoolClass(cls.description, cls.level);
    return {
      ok: true,
      class: {
        id: cls.id,
        name: cls.name,
        description: cls.description,
        level: cls.level,
        section: cls.section,
        room_id: cls.room?.id ?? null,
        room_name: cls.room?.name ?? null,
        active: cls.active,
        is_preschool,
        subject_ids,
        created_at: cls.created_at,
        updated_at: cls.updated_at,
        students: (cls.students ?? []).map((s) => ({
          id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
        })),
      },
    };
  }

  @DenyParents()
  @Get(':id/subjects')
  async getSubjects(@Param('id') id: string, @Req() req: { user?: RequestActor }) {
    await this.levelScope.assertClassAccess(req.user, id);
    await this.classesService.findOne(id);
    const subjects = await this.classesService.getClassSubjects(id);
    return { ok: true, subjects };
  }

  @DenyParents()
  @Post()
  async create(
    @Req() req: { user?: RequestActor },
    @Body()
    body: {
      name: string;
      description?: string;
      level?: string;
      section?: string;
      room_id?: string;
      subject_ids?: string[];
    },
  ) {
    await this.levelScope.assertClassLevelAllowed(req.user, body.level);
    const cls = await this.classesService.create({
      name: body.name,
      description: body.description,
      level: body.level,
      section: body.section,
      room_id: body.room_id,
      subject_ids: body.subject_ids,
    });
    return {
      ok: true,
      class: {
        id: cls.id,
        name: cls.name,
        description: cls.description,
        level: cls.level,
        section: cls.section,
        active: cls.active,
        created_at: cls.created_at,
        updated_at: cls.updated_at,
      },
    };
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Req() req: { user?: RequestActor },
    @Body()
    body: {
      name?: string;
      description?: string;
      level?: string;
      section?: string;
      room_id?: string;
      active?: boolean;
      subject_ids?: string[];
    },
  ) {
    await this.levelScope.assertClassAccess(req.user, id);
    if (body.level !== undefined) {
      await this.levelScope.assertClassLevelAllowed(req.user, body.level);
    }
    const cls = await this.classesService.update(id, {
      ...body,
      section: body.section,
    });
    return {
      ok: true,
      class: {
        id: cls.id,
        name: cls.name,
        description: cls.description,
        level: cls.level,
        section: cls.section,
        active: cls.active,
        created_at: cls.created_at,
        updated_at: cls.updated_at,
      },
    };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: { user?: RequestActor }) {
    await this.levelScope.assertClassAccess(req.user, id);
    await this.classesService.delete(id);
    return { ok: true, deleted: true };
  }
}
