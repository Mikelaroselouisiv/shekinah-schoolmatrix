import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { User } from './user.entity';
import { ROLES_USER_ADMIN } from '../roles/roles.constants';

type AuthRequest = {
  user?: { userId?: number; sub?: number; id?: number; role?: string };
};

@Controller('users')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
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
      must_change_password: !!u.must_change_password,
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
    if (linkedStudentIds !== undefined) return { ...base, linked_student_ids: linkedStudentIds };
    return base;
  }

  private authUserId(req: AuthRequest): number {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié');
    return userId as number;
  }

  /**
   * Direction uniquement. Si le JWT porte un rôle faux ou absent, on confirme
   * le rôle en base plutôt que de refuser un administrateur légitime.
   */
  private async assertUserAdmin(req: AuthRequest): Promise<void> {
    const jwtRole = (req.user?.role ?? '').toUpperCase();
    if ((ROLES_USER_ADMIN as readonly string[]).includes(jwtRole)) return;

    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (userId) {
      try {
        const dbUser = await this.usersService.findOne(userId as number);
        const dbRole = (dbUser.role?.name ?? '').toUpperCase();
        if ((ROLES_USER_ADMIN as readonly string[]).includes(dbRole)) return;
      } catch {
        /* compte introuvable : refus ci-dessous */
      }
    }
    throw new ForbiddenException('Réservé à l’administration');
  }

  @Get('me')
  async me(@Req() req: AuthRequest) {
    const user = await this.usersService.findOne(this.authUserId(req));
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(user.id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  @Get('me/linked-students')
  async myLinkedStudents(@Req() req: AuthRequest) {
    const list = await this.usersService.getLinkedStudentsForFiche(this.authUserId(req));
    return { ok: true, linked_students: list };
  }

  /** Personnalisation profil (parent ou personnel). */
  @Patch('me')
  async updateMe(
    @Req() req: AuthRequest,
    @Body()
    body: Partial<{
      first_name: string;
      last_name: string;
      email: string;
      address: string;
      phone: string;
      whatsapp: string;
      profile_photo_url: string;
      cover_photo_url: string;
    }>,
  ) {
    const user = await this.usersService.updateOwnProfile(this.authUserId(req), body);
    return { ok: true, user: this.toUserResponse(user) };
  }

  /** Changement de mot de passe (ex. quitter le mot de passe par défaut). */
  @Post('me/change-password')
  async changeMyPassword(
    @Req() req: AuthRequest,
    @Body() body: { current_password: string; new_password: string },
  ) {
    const user = await this.usersService.changeOwnPassword(
      this.authUserId(req),
      body.current_password ?? '',
      body.new_password ?? '',
    );
    return { ok: true, user: this.toUserResponse(user) };
  }

  /** Alias REST du changement de mot de passe, pour les clients récents. */
  @Patch('me/password')
  async updateMyPassword(
    @Req() req: AuthRequest,
    @Body() body: { current_password?: string; new_password?: string },
  ) {
    return this.changeMyPassword(req, {
      current_password: body.current_password ?? '',
      new_password: body.new_password ?? '',
    });
  }

  /** Crée un compte enseignant par entrée (e-mail et mot de passe par défaut). */
  @DenyParents()
  @Post('provision-teachers')
  async provisionTeachers(
    @Req() req: AuthRequest,
    @Body()
    body: {
      teachers: { last_name: string; first_name: string; phone: string }[];
      email_domain?: string;
      password?: string;
    },
  ) {
    await this.assertUserAdmin(req);
    if (!Array.isArray(body.teachers) || body.teachers.length === 0) {
      throw new BadRequestException('Liste teachers requise');
    }
    const result = await this.usersService.provisionTeachers(body);
    return { ok: true, ...result };
  }

  @DenyParents()
  @Get('admin-only')
  adminOnly() {
    return { ok: true, message: 'Admin access' };
  }

  /**
   * Annuaire. Sans paramètre, renvoie la liste complète comme avant, pour ne
   * pas casser les Remote déjà installés. Dès qu'un filtre ou une page est
   * demandé, la réponse est paginée et porte `total` / `page` / `take`.
   */
  @DenyParents()
  @Get()
  async listUsers(
    @Req() req: AuthRequest,
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('exclude_role') excludeRole?: string,
    @Query('page') page?: string,
    @Query('take') take?: string,
  ) {
    await this.assertUserAdmin(req);
    const paginated =
      q !== undefined ||
      role !== undefined ||
      excludeRole !== undefined ||
      page !== undefined ||
      take !== undefined;

    if (!paginated) {
      const users = await this.usersService.findAll();
      const withLinks = await Promise.all(
        users.map(async (u) => {
          const ids = await this.usersService.getLinkedStudentIds(u.id);
          return this.toUserResponse(u, ids);
        }),
      );
      return { ok: true, users: withLinks };
    }

    const result = await this.usersService.findPage({
      q,
      role,
      excludeRole,
      page: page ? Number(page) : 1,
      take: take ? Number(take) : 25,
    });
    return {
      ok: true,
      users: result.users.map((u) => this.toUserResponse(u)),
      total: result.total,
      page: result.page,
      take: result.take,
    };
  }

  @DenyParents()
  @Get(':id')
  async one(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    await this.assertUserAdmin(req);
    const user = await this.usersService.findOne(id);
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  @DenyParents()
  @Post()
  async createUser(
    @Req() req: AuthRequest,
    @Body() body: {
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
    },
  ) {
    await this.assertUserAdmin(req);
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

  /** Sans ce garde, un parent pouvait se promouvoir SUPER_ADMIN. */
  @DenyParents()
  @Patch(':id/role')
  async setUserRole(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { roleName: string },
  ) {
    await this.assertUserAdmin(req);
    const user = await this.usersService.setUserRole(id, body.roleName);
    return { ok: true, user: this.toUserResponse(user) };
  }

  @DenyParents()
  @Post(':id/reset-password')
  async resetPassword(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { newPassword: string },
  ) {
    await this.assertUserAdmin(req);
    const user = await this.usersService.resetPassword(id, body.newPassword ?? '');
    return { ok: true, user: this.toUserResponse(user) };
  }

  @DenyParents()
  @Patch(':id')
  async updateUser(
    @Req() req: AuthRequest,
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
    await this.assertUserAdmin(req);
    const user = await this.usersService.updateUser(id, body);
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  @DenyParents()
  @Delete(':id')
  async deleteUser(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertUserAdmin(req);
    await this.usersService.deleteUser(id);
    return { ok: true, deleted: true };
  }
}
