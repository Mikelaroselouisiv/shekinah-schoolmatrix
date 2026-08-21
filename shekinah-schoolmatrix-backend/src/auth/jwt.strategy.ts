import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Le rôle vient de la DB, pas du jeton : lier un élève à un admin
   * ne doit pas le faire passer pour PARENT (le payload JWT peut être périmé).
   */
  async validate(payload: { sub: number; email?: string; role?: string }) {
    const user = await this.users.findOne(payload.sub).catch(() => null);
    if (!user || user.active === false) {
      throw new UnauthorizedException();
    }
    const role =
      user.role?.name ?? (typeof user.role === 'string' ? user.role : '');
    if (!role) {
      throw new UnauthorizedException();
    }
    return { userId: user.id, email: user.email, role };
  }
}
