import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginThrottleService } from './login-throttle.service';
import { RefreshTokenService } from './refresh-token.service';

/** TTL du jeton d'accès quand la session utilise un refresh token. */
const SHORT_ACCESS_TTL = process.env.ACCESS_TOKEN_TTL?.trim() || '30m';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly throttle: LoginThrottleService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
  * `withRefresh` est opt-in : sans lui, la réponse est identique à avant
  * (jeton 7 j / 365 j, pas de refresh token). Le desktop et le mobile déjà
  * déployés ne voient donc aucun changement.
  */
  async login(
    login: string,
    password: string,
    rememberMe = false,
    ip?: string,
    withRefresh = false,
  ) {
    this.throttle.assertAllowed(login, ip);

    const user = await this.users.findByEmailOrPhone(login);
    const ok = user
      ? await this.users.validatePassword(user, password)
      : false;
    if (!user || !ok) {
      this.throttle.recordFailure(login, ip);
      throw new UnauthorizedException('Invalid credentials');
    }
    // Mot de passe correct : le compteur repart, y compris si le compte est
    // désactivé (inutile de pénaliser le titulaire légitime).
    this.throttle.recordSuccess(login, ip);

    // Vérifié APRÈS le mot de passe : ne révèle pas l'existence d'un compte.
    if (user.active === false) {
      throw new UnauthorizedException(
        "Compte désactivé. Contactez l'administration de l'école.",
      );
    }

    const roleName =
      user.role?.name ?? (typeof user.role === 'string' ? user.role : null);
    // Ne jamais inventer PARENT : un jeton « faux parent » bloque @DenyParents (ex. GET /users).
    if (!roleName) {
      throw new UnauthorizedException('Compte sans rôle assigné. Contactez l’administration.');
    }
    const payload = { sub: user.id, role: roleName, email: user.email };
    const publicUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      profile_photo_url: user.profile_photo_url,
      role: roleName,
      must_change_password: !!user.must_change_password,
    };

    if (!withRefresh) {
      const expiresIn = rememberMe ? '365d' : '7d';
      return {
        access_token: await this.jwt.signAsync(payload, { expiresIn }),
        user: publicUser,
      };
    }

    // Session renouvelable : jeton d'accès court + refresh token révocable.
    // `remember_me` n'a plus d'effet ici, c'est le refresh qui tient la session.
    const refresh = await this.refreshTokens.issue(user.id);
    return {
      access_token: await this.jwt.signAsync(payload, {
        expiresIn: this.accessTtlSeconds(),
      }),
      token_type: 'Bearer',
      expires_in: this.accessTtlSeconds(),
      refresh_token: refresh.token,
      refresh_expires_in: refresh.expiresIn,
      user: publicUser,
    };
  }

  /** Renouvelle un jeton d'accès. Rotation systématique du refresh token. */
  async refresh(rawToken: string) {
    const record = await this.refreshTokens.consume(rawToken);
    if (!record) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    let user: Awaited<ReturnType<typeof this.users.findOne>> | null = null;
    try {
      user = await this.users.findOne(record.user_id);
    } catch {
      user = null;
    }
    if (!user) {
      await this.refreshTokens.revokeFamily(record.family_id, 'user_missing');
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // C'est ici que la révocation prend effet : un compte désactivé après
    // connexion perd sa session au premier renouvellement.
    if (user.active === false) {
      await this.refreshTokens.revokeFamily(record.family_id, 'user_inactive');
      throw new UnauthorizedException(
        "Compte désactivé. Contactez l'administration de l'école.",
      );
    }

    const roleName =
      user.role?.name ?? (typeof user.role === 'string' ? user.role : null);
    if (!roleName) {
      await this.refreshTokens.revokeFamily(record.family_id, 'no_role');
      throw new UnauthorizedException(
        'Compte sans rôle assigné. Contactez l’administration.',
      );
    }

    const rotated = await this.refreshTokens.rotate(record);
    return {
      access_token: await this.jwt.signAsync(
        { sub: user.id, role: roleName, email: user.email },
        { expiresIn: this.accessTtlSeconds() },
      ),
      token_type: 'Bearer',
      expires_in: this.accessTtlSeconds(),
      refresh_token: rotated.token,
      refresh_expires_in: rotated.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        profile_photo_url: user.profile_photo_url,
        role: roleName,
        must_change_password: !!user.must_change_password,
      },
    };
  }

  /** Déconnexion. Idempotent : ne révèle jamais si le jeton existait. */
  async logout(rawToken: string) {
    await this.refreshTokens.revokeByToken(rawToken);
    return { ok: true, revoked: true };
  }

  private accessTtlSeconds(): number {
    const m = /^(\d+)([smhd])$/.exec(SHORT_ACCESS_TTL);
    if (!m) return 1800;
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
    return Number.parseInt(m[1], 10) * unit;
  }

  async registerSuperAdmin(email: string, password: string) {
    const count = await this.users.countUsers();
    if (count > 0) {
      throw new ForbiddenException('Setup already completed');
    }
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
