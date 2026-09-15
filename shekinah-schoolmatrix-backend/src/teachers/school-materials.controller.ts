import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { SchoolMaterialsService } from './school-materials.service';

@Controller('school-materials')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
@DenyParents()
export class SchoolMaterialsController {
  constructor(private readonly materials: SchoolMaterialsService) {}

  @Get()
  async list() {
    const school_materials = await this.materials.list();
    return { ok: true, school_materials };
  }

  @Post()
  async create(
    @Body()
    body: {
      kind: string;
      name: string;
      subject_id?: string | null;
    },
  ) {
    const school_material = await this.materials.create(body);
    return { ok: true, school_material };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.materials.remove(id);
    return { ok: true, deleted: true };
  }
}
