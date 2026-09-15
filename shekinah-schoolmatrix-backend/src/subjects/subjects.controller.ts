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
import { SubjectsService } from './subjects.service';
import { Subject } from './subject.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { isSubjectAudience } from '../roles/education-levels';

function toDto(s: Subject) {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    active: s.active,
    audience: isSubjectAudience(s.audience) ? s.audience : 'PRIMAIRE',
    section: s.section ?? null,
    preschool_eval: s.preschool_eval === 'FREQUENCY' ? 'FREQUENCY' : 'LEVEL',
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

@Controller('subjects')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  async list() {
    const subjects = await this.subjectsService.findAll();
    return {
      ok: true,
      subjects: subjects.map(toDto),
    };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const subject = await this.subjectsService.findOne(id);
    return {
      ok: true,
      subject: toDto(subject),
    };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      name: string;
      code?: string;
      audience?: string;
      section?: string | null;
      preschool_eval?: string;
    },
  ) {
    const subject = await this.subjectsService.create(body);
    return {
      ok: true,
      subject: toDto(subject),
    };
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      active?: boolean;
      audience?: string;
      section?: string | null;
      preschool_eval?: string;
    },
  ) {
    const subject = await this.subjectsService.update(id, body);
    return {
      ok: true,
      subject: toDto(subject),
    };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.subjectsService.delete(id);
    return { ok: true, deleted: true };
  }
}
