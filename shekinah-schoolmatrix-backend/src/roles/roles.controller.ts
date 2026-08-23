import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { Role } from './role.entity';

@Controller('roles')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
@DenyParents()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  private toRole(role: Role) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions ?? [],
      education_levels: role.education_levels ?? [],
    };
  }

  @Get()
  async findAll() {
    const roles = await this.rolesService.findAll();
    return {
      ok: true,
      roles: roles.map((r) => this.toRole(r)),
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const role = await this.rolesService.findOne(id);
    return { ok: true, role: this.toRole(role) };
  }

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      description?: string;
      permissions?: string[];
      education_levels?: string[] | null;
    },
  ) {
    const role = await this.rolesService.create({
      name: body.name,
      description: body.description,
      permissions: body.permissions,
      education_levels: body.education_levels,
    });
    return { ok: true, role: this.toRole(role) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      description?: string;
      permissions?: string[];
      education_levels?: string[] | null;
    },
  ) {
    const role = await this.rolesService.update(id, body);
    return { ok: true, role: this.toRole(role) };
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.rolesService.delete(id);
    return { ok: true, deleted: true };
  }
}
