import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserLinkedStudent } from '../users/user-linked-student.entity';
import {
  PARENT_DENIED_KEY,
  PARENT_SCOPE_KEY,
  StudentIdSource,
} from './parent-scope.decorator';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RequestUser = {
  userId?: number;
  sub?: number;
  id?: number;
  role?: string | { name?: string };
};

/**
 * Périmètre des comptes parents.
 *
 * À utiliser APRÈS JwtAuthGuard : `@UseGuards(JwtAuthGuard, ParentScopeGuard)`.
 *
 * - Rôle PARENT : l'élève ciblé doit figurer dans `user_linked_student`
 *   pour le `sub` du jeton, sinon 403. Une route marquée @DenyParents() répond 403.
 * - Avoir des élèves liés ne change PAS le rôle : SUPER_ADMIN / TEACHER / etc.
 *   restent du staff. Seul le nom de rôle `PARENT` active ce périmètre.
 * - Tous les autres rôles : comportement strictement inchangé (aucune requête
 *   supplémentaire, aucun contrôle ajouté). Le desktop et le mobile qui
 *   utilisent ces routes avec des jetons admin/enseignant ne sont pas touchés.
 *
 * Si le JWT dit PARENT (ou n’a pas de rôle), on confirme en base : un login
 * téléphone sans jointure `role` pouvait emballer un admin en « PARENT ».
 */
@Injectable()
export class ParentScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(UserLinkedStudent)
    private readonly linkedRepo: Repository<UserLinkedStudent>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const sources =
      this.reflector.getAllAndOverride<StudentIdSource[]>(PARENT_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const denied =
      this.reflector.getAllAndOverride<boolean>(PARENT_DENIED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    const req = context.switchToHttp().getRequest();

    // 1. Format des identifiants — pour tous les rôles.
    //    Évite qu'un `abc` traverse la couche métier et remonte en 500 SQL.
    const provided: string[] = [];
    for (const src of sources) {
      const raw = this.read(req, src);
      if (raw === undefined || raw === null) continue;
      const value = String(raw).trim();
      if (!value) continue;
      if (!UUID_RE.test(value)) {
        throw new BadRequestException(
          `Identifiant d'élève invalide pour « ${src.key} ».`,
        );
      }
      provided.push(value);
    }

    // 2. Périmètre parent — uniquement pour le rôle PARENT (confirmé DB si besoin).
    if (!(await this.isParent(req.user))) return true;

    if (denied) {
      throw new ForbiddenException(
        "Cette ressource n'est pas accessible depuis un compte parent.",
      );
    }

    if (!sources.length) return true;

    const userId = this.userId(req.user);
    if (!userId) {
      throw new ForbiddenException('Compte parent non identifié.');
    }

    // Une requête sans identifiant d'élève renverrait toute l'école :
    // pour un parent, le filtre est obligatoire.
    if (!provided.length) {
      throw new ForbiddenException(
        "Un identifiant d'élève rattaché à votre compte est requis.",
      );
    }

    const allowed = await this.allowedStudentIds(userId);
    for (const studentId of provided) {
      if (!allowed.has(studentId)) {
        throw new ForbiddenException(
          "Cet élève n'est pas rattaché à votre compte.",
        );
      }
    }

    return true;
  }

  /** Identifiants d'élèves rattachés — source unique : user_linked_student. */
  private async allowedStudentIds(userId: number): Promise<Set<string>> {
    const rows = await this.linkedRepo
      .createQueryBuilder('l')
      .select('l.student_id', 'student_id')
      .where('l.user_id = :userId', { userId })
      .getRawMany<{ student_id: string }>();
    return new Set(rows.map((r) => r.student_id).filter(Boolean));
  }

  private read(
    req: {
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
    },
    src: StudentIdSource,
  ): unknown {
    const bag =
      src.in === 'param' ? req.params : src.in === 'body' ? req.body : req.query;
    return bag?.[src.key];
  }

  private jwtRoleName(user: RequestUser | undefined): string {
    if (!user?.role) return '';
    return typeof user.role === 'string' ? user.role : (user.role?.name ?? '');
  }

  /**
   * Chemin rapide : JWT clairement non-parent → pas de requête.
   * JWT PARENT / vide → confirmation en base (évite faux 403 admin).
   */
  private async isParent(user: RequestUser | undefined): Promise<boolean> {
    if (!user) return false;
    const jwtRole = this.jwtRoleName(user);
    if (jwtRole && jwtRole !== 'PARENT') return false;

    const userId = this.userId(user);
    if (!userId) return jwtRole === 'PARENT';

    try {
      const dbUser = await this.usersRepo.findOne({
        where: { id: userId },
        relations: ['role'],
      });
      return (dbUser?.role?.name ?? '') === 'PARENT';
    } catch {
      return jwtRole === 'PARENT';
    }
  }

  private userId(user: RequestUser | undefined): number | undefined {
    return user?.userId ?? user?.sub ?? user?.id;
  }
}
