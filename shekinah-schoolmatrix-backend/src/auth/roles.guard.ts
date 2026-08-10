import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { UsersService } from '../users/users.service';

/**
 * Autorise si :
 * - le nom de rôle JWT/DB est dans @Roles(...), OU
 * - le rôle a la permission `full_access`, OU
 * - le rôle a au moins une permission de @Permissions(...).
 *
 * Corrige le cas « menu visible (full_access) mais API 403 » (stats, etc.).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const requiredPerms =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!requiredRoles.length && !requiredPerms.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as
      | { userId?: number; role?: string; permissions?: string[] }
      | undefined;
    if (!user) return false;

    if (requiredRoles.length && user.role && requiredRoles.includes(user.role)) {
      return true;
    }

    let roleName = user.role ?? '';
    let perms: string[] = Array.isArray(user.permissions)
      ? user.permissions
      : [];

    if (user.userId) {
      try {
        const dbUser = await this.usersService.findOne(user.userId);
        if (dbUser?.role) {
          roleName = dbUser.role.name ?? roleName;
          if (Array.isArray(dbUser.role.permissions)) {
            perms = dbUser.role.permissions;
          }
        }
      } catch {
        /* fallback JWT */
      }
    }

    if (requiredRoles.length && roleName && requiredRoles.includes(roleName)) {
      return true;
    }

    if (perms.includes('full_access')) return true;

    if (requiredPerms.length) {
      return requiredPerms.some((p) => this.matchesPermission(perms, p));
    }

    return false;
  }

  private matchesPermission(perms: string[], key: string): boolean {
    if (perms.includes(key)) return true;
    if (key === 'stats-academiques') {
      return (
        perms.includes('grades') ||
        perms.includes('classes') ||
        perms.includes('stats-academiques')
      );
    }
    if (key === 'stats-financieres') {
      return (
        perms.includes('finance') ||
        perms.includes('economat') ||
        perms.includes('stats-financieres')
      );
    }
    return false;
  }
}
