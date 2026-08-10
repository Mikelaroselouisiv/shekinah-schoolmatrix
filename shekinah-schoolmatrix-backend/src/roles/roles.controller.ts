import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    const roles = await this.rolesService.findAll();
    return { ok: true, roles };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const role = await this.rolesService.findOne(id);
    return { ok: true, role: { id: role.id, name: role.name, description: role.description, permissions: role.permissions ?? [] } };
  }

  @Post()
  async create(@Body() body: { name: string; description?: string; permissions?: string[] }) {
    const role = await this.rolesService.create({
      name: body.name,
      description: body.description,
      permissions: body.permissions,
    });
    return { ok: true, role: { id: role.id, name: role.name, description: role.description, permissions: role.permissions ?? [] } };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; description?: string; permissions?: string[] },
  ) {
    const role = await this.rolesService.update(id, body);
    return { ok: true, role: { id: role.id, name: role.name, description: role.description, permissions: role.permissions ?? [] } };
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.rolesService.delete(id);
    return { ok: true, deleted: true };
  }
}
