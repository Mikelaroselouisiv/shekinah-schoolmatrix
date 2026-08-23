import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Class } from '../classes/class.entity';
import { User } from '../users/user.entity';
import {
  isFullAccessRoleName,
  isTeacherRoleName,
} from '../roles/roles.constants';
import { normalizeEducationLevels } from '../roles/education-levels';

export type RequestActor = {
  userId?: number;
  sub?: number;
  id?: number;
  role?: string | { name?: string };
};

export type LevelScope =
  | { kind: 'all' }
  | { kind: 'restricted'; levels: string[]; classIds: string[] };

@Injectable()
export class LevelScopeService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
  ) {}

  async resolve(actor?: RequestActor): Promise<LevelScope> {
    const roleName = this.roleName(actor);
    if (isTeacherRoleName(roleName) || roleName === 'PARENT') return { kind: 'all' };
    if (isFullAccessRoleName(roleName)) return { kind: 'all' };

    const userId = actor?.userId ?? actor?.sub ?? actor?.id;
    if (!userId) return { kind: 'all' };

    const user = await this.usersRepo.findOne({
      where: { id: Number(userId) },
      relations: ['role'],
    });
    const dbRole = user?.role?.name ?? roleName;
    if (isTeacherRoleName(dbRole) || dbRole === 'PARENT' || isFullAccessRoleName(dbRole)) {
      return { kind: 'all' };
    }
    if (user?.role?.permissions?.includes('full_access')) return { kind: 'all' };

    const levels = normalizeEducationLevels(user?.role?.education_levels);
    if (!levels) return { kind: 'all' };

    const classes = await this.classRepo.find({
      where: { level: In(levels) },
    });
    return {
      kind: 'restricted',
      levels,
      classIds: classes.map((c) => c.id),
    };
  }

  async filterClasses<T extends { id?: string; level?: string | null }>(
    actor: RequestActor | undefined,
    classes: T[],
  ): Promise<T[]> {
    const scope = await this.resolve(actor);
    if (scope.kind === 'all') return classes;
    const ids = new Set(scope.classIds);
    const levels = new Set(scope.levels);
    return classes.filter(
      (c) => (c.id && ids.has(c.id)) || (c.level && levels.has(c.level)),
    );
  }

  async filterByClassId<T>(
    actor: RequestActor | undefined,
    items: T[],
    classIdOf: (item: T) => string | null | undefined,
  ): Promise<T[]> {
    const scope = await this.resolve(actor);
    if (scope.kind === 'all') return items;
    const ids = new Set(scope.classIds);
    return items.filter((item) => {
      const cid = classIdOf(item);
      return !!cid && ids.has(cid);
    });
  }

  async assertClassAccess(
    actor: RequestActor | undefined,
    classId?: string | null,
  ): Promise<void> {
    if (!classId) return;
    const scope = await this.resolve(actor);
    if (scope.kind === 'all') return;
    if (!scope.classIds.includes(classId)) {
      throw new ForbiddenException('Cette classe n’est pas dans votre niveau.');
    }
  }

  async assertClassLevelAllowed(
    actor: RequestActor | undefined,
    level?: string | null,
  ): Promise<void> {
    const scope = await this.resolve(actor);
    if (scope.kind === 'all') return;
    if (!level || !scope.levels.includes(level)) {
      throw new ForbiddenException('Ce niveau n’est pas dans votre périmètre.');
    }
  }

  private roleName(actor?: RequestActor): string {
    if (!actor?.role) return '';
    return typeof actor.role === 'string' ? actor.role : (actor.role.name ?? '');
  }
}
