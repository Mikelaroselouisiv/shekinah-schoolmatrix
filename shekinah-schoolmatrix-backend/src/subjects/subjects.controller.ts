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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('subjects')
@UseGuards(JwtAuthGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  async list() {
    const subjects = await this.subjectsService.findAll();
    return {
      ok: true,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        active: s.active,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })),
    };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const subject = await this.subjectsService.findOne(id);
    return {
      ok: true,
      subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        active: subject.active,
        created_at: subject.created_at,
        updated_at: subject.updated_at,
      },
    };
  }

  @Post()
  async create(@Body() body: { name: string; code?: string }) {
    const subject = await this.subjectsService.create({
      name: body.name,
      code: body.code,
    });
    return {
      ok: true,
      subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        active: subject.active,
        created_at: subject.created_at,
        updated_at: subject.updated_at,
      },
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; code?: string; active?: boolean },
  ) {
    const subject = await this.subjectsService.update(id, body);
    return {
      ok: true,
      subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        active: subject.active,
        created_at: subject.created_at,
        updated_at: subject.updated_at,
      },
    };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.subjectsService.delete(id);
    return { ok: true, deleted: true };
  }
}
