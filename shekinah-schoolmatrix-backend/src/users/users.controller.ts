import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, ParseIntPipe, ForbiddenException, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { ParentAccountService } from './parent-account.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';
import { User } from './user.entity';
import { ROLES_USER_ADMIN } from '../roles/roles.constants';
import { UploadsService } from '../uploads/uploads.service';

const PROFILE_PHOTO_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

@Controller('users')
@UseGuards(JwtAuthGuard, ParentScopeGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadsService: UploadsService,
    private readonly parentAccountService: ParentAccountService,
  ) {}

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
      role_education_levels: u.role?.education_levels ?? [],
      active: u.active,
      must_change_password: !!u.must_change_password,
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
    if (linkedStudentIds !== undefined) return { ...base, linked_student_ids: linkedStudentIds };
    return base;
  }

  private authUserId(req: { user?: { userId?: number; sub?: number; id?: number } }): number {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié');
    return userId as number;
  }

  /**
   * Direction uniquement. Si le JWT a un rôle faux/manquant (ex. login téléphone
   * sans jointure role → PARENT inventé), on confirme le rôle en base.
   */
  private async assertUserAdmin(req: {
    user?: { userId?: number; sub?: number; id?: number; role?: string };
  }) {
    const jwtRole = (req.user?.role ?? '').toUpperCase();
    if ((ROLES_USER_ADMIN as readonly string[]).includes(jwtRole)) return;

    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (userId) {
      try {
        const dbUser = await this.usersService.findOne(userId as number);
        const dbRole = (dbUser.role?.name ?? '').toUpperCase();
        if ((ROLES_USER_ADMIN as readonly string[]).includes(dbRole)) return;
      } catch {
        /* fall through */
      }
    }
    throw new ForbiddenException('Réservé à l’administration');
  }

  @Get('me')
  async me(@Req() req: { user?: { userId?: number; sub?: number; id?: number } }) {
    const user = await this.usersService.findOne(this.authUserId(req));
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(user.id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  /** Mobile / site : nom, prénom, e-mail, téléphone (tout ou partie). */
  @Patch('me')
  async updateMe(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Body() body: Partial<{ first_name: string; last_name: string; email: string; phone: string; profile_photo_url: string }>,
  ) {
    const user = await this.usersService.updateOwnProfile(this.authUserId(req), body);
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Patch('me/name')
  async updateMyName(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Body() body: { first_name?: string; last_name?: string },
  ) {
    const user = await this.usersService.updateOwnProfile(this.authUserId(req), {
      first_name: body.first_name,
      last_name: body.last_name,
    });
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Patch('me/email')
  async updateMyEmail(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Body() body: { email?: string },
  ) {
    if (!body.email?.trim()) throw new BadRequestException('E-mail requis');
    const user = await this.usersService.updateOwnProfile(this.authUserId(req), { email: body.email });
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Patch('me/phone')
  async updateMyPhone(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Body() body: { phone?: string },
  ) {
    if (!body.phone?.trim()) throw new BadRequestException('Téléphone requis');
    const user = await this.usersService.updateOwnProfile(this.authUserId(req), { phone: body.phone });
    return { ok: true, user: this.toUserResponse(user) };
  }

  /** Mobile / site : envoyer le fichier (champ multipart `file`). */
  @Post('me/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadMyPhoto(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname?: string },
  ) {
    if (!file?.buffer) throw new BadRequestException('Aucun fichier envoyé');
    const mimetype = file.mimetype?.toLowerCase() ?? '';
    if (!PROFILE_PHOTO_MIMES.includes(mimetype)) {
      throw new BadRequestException('Type de fichier non autorisé. Utilisez JPEG, PNG, GIF ou WebP.');
    }
    const url = await this.uploadsService.saveFile(
      file.buffer,
      mimetype,
      file.originalname ?? 'photo',
    );
    const user = await this.usersService.updateOwnProfile(this.authUserId(req), {
      profile_photo_url: url,
    });
    return { ok: true, url, user: this.toUserResponse(user) };
  }

  /** Si l’app a déjà uploadé via POST /uploads : coller l’URL. */
  @Patch('me/photo')
  async setMyPhotoUrl(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Body() body: { profile_photo_url?: string },
  ) {
    const user = await this.usersService.updateOwnProfile(this.authUserId(req), {
      profile_photo_url: body.profile_photo_url ?? '',
    });
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Patch('me/password')
  async updateMyPassword(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number } },
    @Body() body: { current_password?: string; new_password?: string },
  ) {
    const user = await this.usersService.changeOwnPassword(
      this.authUserId(req),
      body.current_password ?? '',
      body.new_password ?? '',
    );
    return { ok: true, user: this.toUserResponse(user) };
  }

  @Get('me/linked-students')
  async myLinkedStudents(@Req() req: { user?: { userId?: number; sub?: number; id?: number } }) {
    const list = await this.usersService.getLinkedStudentsForFiche(this.authUserId(req));
    return { ok: true, linked_students: list };
  }

  /** Crée des comptes TEACHER (e-mail nom.prenom@domaine, mot de passe défaut, must_change_password). */
  @DenyParents()
  @Post('provision-teachers')
  async provisionTeachers(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
    @Body() body: {
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

  /**
   * Rattache les comptes PARENT restés sans enfant à l’élève dont ils portent
   * le nom (reprise de base, inscription en masse d’une version antérieure).
   */
  @DenyParents()
  @Post('parents/repair-links')
  async repairParentLinks(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
  ) {
    await this.assertUserAdmin(req);
    const result = await this.parentAccountService.repairOrphanParentLinks();
    return { ok: true, ...result };
  }

  @DenyParents()
  @Get('admin-only')
  adminOnly() {
    return { ok: true, message: 'Admin access' };
  }

  /** Annuaire paginé (recherche nom / email / téléphone). Liens élèves : GET /users/:id. */
  @DenyParents()
  @Get()
  async listUsers(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('exclude_role') excludeRole?: string,
    @Query('page') page?: string,
    @Query('take') take?: string,
  ) {
    await this.assertUserAdmin(req);
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

  /**
   * Purge de test : tous les comptes PARENT (+ liens élèves).
   * Ne touche pas au staff. Sync via tombstones ORM.
   */
  @DenyParents()
  @Delete('parents')
  async deleteAllParents(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
  ) {
    await this.assertUserAdmin(req);
    const result = await this.parentAccountService.deleteAllParentAccounts();
    return { ok: true, ...result };
  }

  /** Purge PARENT sans aucun élève lié (orphelins après wipe élèves). */
  @DenyParents()
  @Delete('parents/orphans')
  async deleteOrphanParents(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
  ) {
    await this.assertUserAdmin(req);
    const result = await this.parentAccountService.deleteAllOrphanParentAccounts();
    return { ok: true, ...result };
  }

  @DenyParents()
  @Get(':id')
  async one(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertUserAdmin(req);
    const user = await this.usersService.findOne(id);
    const linkedStudentIds = await this.usersService.getLinkedStudentIds(id);
    return { ok: true, user: this.toUserResponse(user, linkedStudentIds) };
  }

  @DenyParents()
  @Post()
  async createUser(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
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
  }) {
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

  /** Changement de rôle : sans ce garde, un parent pouvait se promouvoir SUPER_ADMIN. */
  @DenyParents()
  @Patch(':id/role')
  async setUserRole(
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
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
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
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
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
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
    @Req() req: { user?: { userId?: number; sub?: number; id?: number; role?: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertUserAdmin(req);
    await this.usersService.deleteUser(id);
    return { ok: true, deleted: true };
  }
}
