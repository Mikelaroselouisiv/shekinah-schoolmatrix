import { Controller, Get, Post, Body, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Controller('setup')
export class SetupController {
  constructor(private readonly usersService: UsersService) {}

  @Get('status')
  async getStatus() {
    const count = await this.usersService.countUsers();
    if (count > 0) {
      throw new ForbiddenException('Setup already completed');
    }
    return { setupRequired: true };
  }

  @Post('initial-admin')
  async createInitialAdmin(@Body() body: { email: string; phone?: string; password: string }) {
    const count = await this.usersService.countUsers();
    if (count > 0) {
      throw new ForbiddenException('Setup already completed');
    }
    const user = await this.usersService.createUser({
      email: body.email,
      phone: body.phone,
      password: body.password,
      roleName: 'SUPER_ADMIN',
    });
    return { ok: true, user: { id: user.id, email: user.email } };
  }
}
