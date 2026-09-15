import { Controller, Post, Body, BadRequestException, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

/**
 * IP réellement vue par nginx.
 * `proxy_add_x_forwarded_for` ajoute $remote_addr EN FIN de chaîne : la
 * dernière entrée est celle du proxy, les précédentes sont fournies par le
 * client et donc falsifiables.
 */
function clientIp(req: Request): string | undefined {
  const header = req.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (raw) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register-super-admin')
  registerSuperAdmin(@Body() body: { email: string; password: string }) {
    return this.auth.registerSuperAdmin(body.email, body.password);
  }

  @Post('login')
  login(
    @Req() req: Request,
    @Body()
    body: {
      login?: string;
      email?: string;
      password: string;
      remember_me?: boolean;
      /** true = jeton d'accès court + refresh token révocable. */
      refresh?: boolean;
    },
  ) {
    const login = (body.login ?? body.email ?? '').trim();
    if (!login) {
      throw new BadRequestException('Email ou numéro de téléphone requis');
    }
    return this.auth.login(
      login,
      body.password,
      body.remember_me === true,
      clientIp(req),
      body.refresh === true,
    );
  }

  /**
   * Renouvelle un jeton d'accès à partir d'un refresh token.
   * Le refresh token est tourné à chaque appel : réutilisez toujours le
   * dernier reçu, l'ancien devient invalide immédiatement.
   */
  @Post('refresh')
  refresh(@Body() body: { refresh_token?: string }) {
    const token = (body?.refresh_token ?? '').trim();
    if (!token) {
      throw new BadRequestException('refresh_token requis');
    }
    return this.auth.refresh(token);
  }

  /** Ferme la session correspondant au refresh token fourni. */
  @Post('logout')
  logout(@Body() body: { refresh_token?: string }) {
    return this.auth.logout((body?.refresh_token ?? '').trim());
  }
}
