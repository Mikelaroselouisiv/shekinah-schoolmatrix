import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(login: string, password: string, rememberMe = false) {
    const user = await this.users.findByEmailOrPhone(login);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await this.users.validatePassword(user, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const roleName = user.role?.name ?? (typeof user.role === 'string' ? user.role : 'PARENT');
    const payload = { sub: user.id, role: roleName, email: user.email };
    const expiresIn = rememberMe ? '365d' : '7d';
    return {
      access_token: await this.jwt.signAsync(payload, { expiresIn }),
      user: { id: user.id, email: user.email, role: user.role?.name ?? user.role },
    };
  }

  async registerSuperAdmin(email: string, password: string) {
    const exists = await this.users.findByEmail(email.toLowerCase().trim());
    if (exists) throw new ConflictException('Email already exists');
    const user = await this.users.createUser({
      email,
      password,
      roleName: 'SUPER_ADMIN',
    });
    return { id: user.id, email: user.email, role: user.role };
  }
}
