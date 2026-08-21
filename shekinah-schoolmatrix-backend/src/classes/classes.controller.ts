import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { isPreschoolClass } from '../utils/preschool';

@Controller('classes')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  async list() {
    const classes = await this.classesService.findAll();
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
  async one(@Param('id') id: string) {
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
  async getSubjects(@Param('id') id: string) {
    await this.classesService.findOne(id);
    const subjects = await this.classesService.getClassSubjects(id);
    return { ok: true, subjects };
  }

  @DenyParents()
  @Post()
  async create(
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
  async delete(@Param('id') id: string) {
    await this.classesService.delete(id);
    return { ok: true, deleted: true };
  }
}
