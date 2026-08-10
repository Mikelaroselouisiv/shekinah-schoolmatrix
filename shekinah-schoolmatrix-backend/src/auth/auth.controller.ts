import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register-super-admin')
  registerSuperAdmin(@Body() body: { email: string; password: string }) {
    return this.auth.registerSuperAdmin(body.email, body.password);
  }

  @Post('login')
  login(@Body() body: { login?: string; email?: string; password: string; remember_me?: boolean }) {
    const login = (body.login ?? body.email ?? '').trim();
    if (!login) {
      throw new BadRequestException('Email ou numéro de téléphone requis');
    }
    return this.auth.login(login, body.password, body.remember_me === true);
  }
}
