import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { ScheduleMomentsService } from './schedule-moments.service';

@Controller('bring-item-catalog')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
@DenyParents()
export class BringItemCatalogController {
  constructor(private readonly moments: ScheduleMomentsService) {}

  @Get()
  async list() {
    const catalog = await this.moments.listBringCatalogItems();
    return { ok: true, catalog };
  }

  @Post()
  async create(@Body() body: { label?: string }) {
    const item = await this.moments.createBringCatalogItem(body.label ?? '');
    return { ok: true, item };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { label?: string }) {
    const item = await this.moments.updateBringCatalogItem(id, body.label ?? '');
    return { ok: true, item };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.moments.removeBringCatalogItem(id);
    return { ok: true, deleted: true };
  }
}
