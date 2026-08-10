import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from './user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private toUserResponse(u: User, linkedStudentIds?: string[]) {
    const base = {
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      address: u.address,
      phone: u.phone,
      whatsapp: u.whatsapp,
      profile_photo_url: u.profile_photo_url,
      cover_photo_url: u.cover_photo_url,
      order_number: u.order_number ?? null,
      role: u.role?.name,
      role_permissions: u.role?.permissions ?? [],
      active: u.active,
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
    if (linkedStudentIds !== undefined) return { ...base, linked_student_ids: linkedStudentIds };
    return base;
  }

  @Get('me')
  async me(@Req() req: { user?: { userId?: number; sub?: number; id?: number } }) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) return { ok: true, user: req.user };
    const user = await this.usersService.findOne(userId as number);
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Get('me/linked-students')
  async myLinkedStudents(@Req() req: { user?: { userId?: number; sub?: number; id?: number } }) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) return { ok: true, linked_students: [] };
    const list = await this.usersService.getLinkedStudentsForFiche(userId as number);
    return { ok: true, linked_students: list };
  }

  @Get('admin-only')
  adminOnly() {
    return { ok: true, message: 'Admin access' };
  }

  @Get()
  async listUsers() {
    const users = await this.usersService.findAll();
    const withLinks = await Promise.all(
      users.map(async (u) => {
        const ids = await this.usersService.getLinkedStudentIds(u.id);
        return this.toUserResponse(u, ids);
      }),
    );
    return { ok: true, users: withLinks };
  }

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findOne(id);
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  @Post()
  async createUser(@Body() body: {
    first_name?: string;
    last_name?: string;
    email: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    password: string;
    roleName?: string;
    profile_photo_url?: string;
    cover_photo_url?: string;
    order_number?: string;
    linked_student_ids?: string[];
  }) {
    const user = await this.usersService.createUser({
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      address: body.address,
      phone: body.phone,
      whatsapp: body.whatsapp,
      password: body.password,
      roleName: body.roleName ?? 'PARENT',
      profile_photo_url: body.profile_photo_url,
      cover_photo_url: body.cover_photo_url,
      order_number: body.order_number,
      linked_student_ids: body.linked_student_ids,
    });
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(user.id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  @Patch(':id/role')
  async setUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { roleName: string },
  ) {
    const user = await this.usersService.setUserRole(id, body.roleName);
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { newPassword: string },
  ) {
    const user = await this.usersService.resetPassword(id, body.newPassword ?? '');
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Patch(':id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<{
      first_name: string;
      last_name: string;
      email: string;
      address: string;
      phone: string;
      whatsapp: string;
      active: boolean;
      profile_photo_url: string;
      cover_photo_url: string;
      order_number: string;
      password: string;
      linked_student_ids: string[];
    }>,
  ) {
    const user = await this.usersService.updateUser(id, body);
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  @Delete(':id')
  async deleteUser(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.deleteUser(id);
    return { ok: true, deleted: true };
  }
}
