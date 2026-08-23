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
  Req,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { LevelScopeService, type RequestActor } from '../auth/level-scope.service';

@Controller('rooms')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly levelScope: LevelScopeService,
  ) {}

  @Get()
  async list(
    @Req() req: { user?: RequestActor },
    @Query('class_id') classId?: string,
  ) {
    if (classId) await this.levelScope.assertClassAccess(req.user, classId);
    const rooms = await this.levelScope.filterByClassId(
      req.user,
      await this.roomsService.findAll(classId || undefined),
      (r) => r.class_id,
    );
    return { ok: true, rooms };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const room = await this.roomsService.findOne(id);
    return { ok: true, room };
  }

  @DenyParents()
  @Post()
  async create(
    @Body()
    body: {
      name: string;
      description?: string;
      capacity?: number | null;
      class_id?: string | null;
    },
  ) {
    const room = await this.roomsService.create(body);
    return { ok: true, room };
  }

  @DenyParents()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      capacity?: number | null;
      class_id?: string | null;
      active?: boolean;
    },
  ) {
    const room = await this.roomsService.update(id, body);
    return { ok: true, room };
  }

  @DenyParents()
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.roomsService.delete(id);
    return { ok: true, deleted: true };
  }
}
