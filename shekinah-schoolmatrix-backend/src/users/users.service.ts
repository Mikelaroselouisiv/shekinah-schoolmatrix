import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { UserLinkedStudent } from './user-linked-student.entity';
import { Role } from '../roles/role.entity';
import { Student } from '../students/student.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { SyncKickService } from '../sync/sync-kick.service';
import { SyncService } from '../sync/sync.service';
import { DEFAULT_STAFF_EMAIL_DOMAIN, DEFAULT_STAFF_PASSWORD } from './staff-account.constants';
import { buildStaffEmail } from './staff-email';
import {
  TEACHER_ROLE_NAMES,
  isTeacherRoleName,
} from '../roles/roles.constants';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(UserLinkedStudent)
    private readonly linkedStudentRepo: Repository<UserLinkedStudent>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly syncKick: SyncKickService,
    private readonly syncService: SyncService,
  ) {}

  /**
   * Ferme toutes les sessions renouvelables d'un compte.
   * Le jeton d'accès déjà émis reste valable jusqu'à son expiration (30 min
   * par défaut) : c'est la limite d'un JWT sans introspection.
   */
  private async revokeSessions(userId: number, reason: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { user_id: userId, revoked_at: IsNull() },
      { revoked_at: new Date(), revoked_reason: reason.slice(0, 40) },
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    // relations explicites : le QueryBuilder téléphone (ci-dessous) n’applique pas eager.
    return this.usersRepo.findOne({
      where: { email: email.toLowerCase().trim() },
      relations: ['role'],
    });
  }

  async findByEmailOrPhone(login: string): Promise<User | null> {
    const trimmed = login.trim();
    if (!trimmed) return null;
    const byEmail = await this.findByEmail(trimmed);
    if (byEmail) return byEmail;
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 6) return null;
    // QueryBuilder : pas d’eager TypeORM → joindre role sinon le JWT login tombe sur PARENT.
    const users = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .where("REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g') = :digits", {
        digits: digitsOnly,
      })
      .getMany();
    return users[0] ?? null;
  }

  async countUsers(): Promise<number> {
    return this.usersRepo.count();
  }

  async findAll(): Promise<User[]> {
    return this.usersRepo.find({ order: { id: 'ASC' } });
  }

  /** Annuaire paginé : nom, email, téléphone — sans charger toute l’école. */
  async findPage(params: {
    q?: string;
    role?: string;
    excludeRole?: string;
    page?: number;
    take?: number;
  }): Promise<{ users: User[]; total: number; page: number; take: number }> {
    const take = Math.min(Math.max(Number(params.take) || 25, 1), 50);
    const page = Math.max(Number(params.page) || 1, 1);
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r');

    const q = (params.q ?? '').trim();
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '')}%`;
      const digits = q.replace(/\D/g, '');
      if (digits.length >= 3) {
        qb.andWhere(
          `(u.first_name ILIKE :like OR u.last_name ILIKE :like OR u.email ILIKE :like
            OR COALESCE(u.phone, '') ILIKE :like
            OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) ILIKE :like
            OR REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g') LIKE :digits)`,
          { like, digits: `%${digits}%` },
        );
      } else {
        qb.andWhere(
          `(u.first_name ILIKE :like OR u.last_name ILIKE :like OR u.email ILIKE :like
            OR COALESCE(u.phone, '') ILIKE :like
            OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) ILIKE :like)`,
          { like },
        );
      }
    }
    if (params.role?.trim()) {
      qb.andWhere('UPPER(r.name) = :role', {
        role: params.role.trim().toUpperCase(),
      });
    }
    if (params.excludeRole?.trim()) {
      qb.andWhere('UPPER(r.name) != :exRole', {
        exRole: params.excludeRole.trim().toUpperCase(),
      });
    }
    qb.orderBy('u.last_name', 'ASC')
      .addOrderBy('u.first_name', 'ASC')
      .addOrderBy('u.id', 'ASC')
      .skip((page - 1) * take)
      .take(take);

    const [users, total] = await qb.getManyAndCount();
    return { users, total, page, take };
  }

  async findParents(): Promise<User[]> {
    return this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .where('r.name = :role', { role: 'PARENT' })
      .getMany();
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async createUser(params: {
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
    must_change_password?: boolean;
  }): Promise<User> {
    const email = params.email.toLowerCase().trim();
    const first_name = params.first_name?.trim() || '—';
    const last_name = params.last_name?.trim() || '—';
    const address = params.address?.trim() || '—';
    const phone = params.phone?.trim() || '—';
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Email already exists');
    const pwd = (params.password ?? '').trim();
    if (pwd.length < 6) throw new BadRequestException('Le mot de passe doit faire au moins 6 caractères');
    const roleName = (params.roleName ?? 'PARENT').toUpperCase().trim();
    const role = await this.resolveRole(roleName);
    const password_hash = await bcrypt.hash(pwd, 10);
    const user = this.usersRepo.create({
      first_name,
      last_name,
      email,
      address,
      phone,
      whatsapp: params.whatsapp?.trim(),
      profile_photo_url: params.profile_photo_url?.trim(),
      cover_photo_url: params.cover_photo_url?.trim(),
      order_number: params.order_number?.trim() || undefined,
      password_hash,
      role,
      active: true,
      must_change_password: params.must_change_password === true,
    });
    const saved = await this.usersRepo.save(user);
    // Nouveau compte : un tombstone plus vieux pour ce serial n’a plus cours.
    await this.syncService.forgetDeleted('User', saved.id);
    if (params.linked_student_ids?.length) {
      for (const studentId of [...new Set(params.linked_student_ids.filter(Boolean))]) {
        await this.linkStudent(saved.id, studentId, false);
      }
    }
    this.syncKick.kick('user-create');
    return saved;
  }

  /**
   * Lien officiel compte ↔ élève (`user_linked_student`) — même table que
   * l’écran Utilisateurs (« Dossiers élèves liés » / n° ministère).
   * Ajoute sans retirer les autres enfants déjà liés.
   * Ne change JAMAIS le rôle : un SUPER_ADMIN / TEACHER reste lui-même.
   */
  async linkStudent(userId: number, studentId: string, kick = true): Promise<boolean> {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student) return false;
    const existing = await this.linkedStudentRepo.findOne({
      where: { user: { id: userId }, student: { id: studentId } },
    });
    if (existing) return false;
    // insert() et non save({ user: { id } }) : TypeORM persistait l'User
    // partiel et pouvait écraser role_id (staff → PARENT / rôle vide).
    await this.linkedStudentRepo
      .createQueryBuilder()
      .insert()
      .into(UserLinkedStudent)
      .values({
        user: { id: userId } as User,
        student: { id: studentId } as Student,
      })
      .orIgnore()
      .execute();
    if (kick) this.syncKick.kick('user-link-student');
    return true;
  }

  /**
   * L'école peut avoir renommé TEACHER en PROFESSEUR : chercher les alias
   * plutôt que d'échouer sur un nom canonique absent.
   */
  private async resolveRole(name: string): Promise<Role> {
    const roleName = name.toUpperCase().trim();
    const exact = await this.rolesRepo.findOne({ where: { name: roleName } });
    if (exact) return exact;
    if (isTeacherRoleName(roleName)) {
      const alias = await this.rolesRepo.findOne({
        where: { name: In(TEACHER_ROLE_NAMES) },
      });
      if (alias) return alias;
    }
    throw new BadRequestException(`Role not found: ${roleName}`);
  }

  async setUserRole(userId: number, roleName: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.resolveRole(roleName);
    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ role })
      .where('id = :id', { id: userId })
      .execute();
    this.syncKick.kick('user-role');
    return this.findOne(userId);
  }

  async updateUser(userId: number, params: Partial<{
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
  }>): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const patch: Record<string, unknown> = {};
    if (params.first_name !== undefined) patch.first_name = params.first_name.trim() || undefined;
    if (params.last_name !== undefined) patch.last_name = params.last_name.trim() || undefined;
    if (params.email !== undefined) {
      const email = params.email.toLowerCase().trim();
      const exists = await this.usersRepo.findOne({ where: { email } });
      if (exists && exists.id !== userId) throw new BadRequestException('Email already exists');
      patch.email = email;
    }
    if (params.address !== undefined) patch.address = params.address.trim() || undefined;
    if (params.phone !== undefined) patch.phone = params.phone.trim() || undefined;
    if (params.whatsapp !== undefined) patch.whatsapp = params.whatsapp.trim() || undefined;
    if (params.active !== undefined) patch.active = params.active;
    if (params.profile_photo_url !== undefined) {
      patch.profile_photo_url = params.profile_photo_url.trim() || undefined;
    }
    if (params.cover_photo_url !== undefined) {
      patch.cover_photo_url = params.cover_photo_url.trim() || undefined;
    }
    if (params.order_number !== undefined) patch.order_number = params.order_number.trim() || null;
    if (params.password !== undefined && params.password.length > 0) {
      patch.password_hash = await bcrypt.hash(params.password, 10);
    }
    if (Object.keys(patch).length > 0) {
      await this.usersRepo.update(userId, patch);
    }
    if (params.linked_student_ids !== undefined) {
      const previous = await this.linkedStudentRepo.find({
        where: { user: { id: userId } },
      });
      if (previous.length) await this.linkedStudentRepo.remove(previous);
      for (const studentId of [...new Set(params.linked_student_ids.filter(Boolean))]) {
        await this.linkStudent(userId, studentId, false);
      }
    }
    // Désactivation / MDP admin : révoque les sessions renouvelables.
    if (params.active === false) {
      await this.revokeSessions(userId, 'account_disabled');
    }
    if (params.password !== undefined && params.password.length > 0) {
      await this.revokeSessions(userId, 'password_changed');
    }
    this.syncKick.kick('user-update');
    return this.findOne(userId);
  }

  async getLinkedStudentIds(userId: number): Promise<string[]> {
    const links = await this.linkedStudentRepo.find({
      where: { user: { id: userId } },
      relations: ['student'],
    });
    return links.map((l) => l.student.id);
  }

  async getLinkedStudentsForFiche(userId: number): Promise<{
    id: string;
    order_number: string | null;
    management_code: string | null;
    first_name: string;
    last_name: string;
    class_id: string;
    class_name: string;
  }[]> {
    const links = await this.linkedStudentRepo.find({
      where: { user: { id: userId } },
      relations: ['student', 'student.class'],
    });
    return links.map((l) => ({
      id: l.student.id,
      order_number: l.student.order_number ?? null,
      management_code: l.student.management_code ?? null,
      first_name: l.student.first_name,
      last_name: l.student.last_name,
      class_id: l.student.class?.id ?? '',
      class_name: l.student.class?.name ?? '—',
    }));
  }

  async deleteUser(userId: number): Promise<{ deleted: boolean }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    // Tombstone AVANT hard delete : le prochain pull cloud ne peut pas ressusciter.
    await this.syncService.markDeleted('User', userId, undefined, { kick: false });
    const links = await this.linkedStudentRepo.find({
      where: { user: { id: userId } },
    });
    if (links.length) await this.linkedStudentRepo.remove(links);
    await this.usersRepo.remove(user);
    this.syncKick.kick('user-delete');
    return { deleted: true };
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }

  async resetPassword(userId: number, newPassword: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const pwd = newPassword?.trim() ?? '';
    if (pwd.length < 6) throw new BadRequestException('Le mot de passe doit faire au moins 6 caractères');
    await this.usersRepo.update(userId, {
      password_hash: await bcrypt.hash(pwd, 10),
      must_change_password: true,
    });
    await this.revokeSessions(userId, 'password_reset');
    this.syncKick.kick('user-password');
    return this.findOne(userId);
  }

  private phoneDigits(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  async findByPhoneDigits(digits: string): Promise<User | null> {
    if (digits.length < 6) return null;
    return (
      (await this.usersRepo
        .createQueryBuilder('u')
        .leftJoinAndSelect('u.role', 'r')
        .where("REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g') = :digits", { digits })
        .getOne()) ?? null
    );
  }

  async assertEmailAvailable(email: string, exceptUserId?: number): Promise<void> {
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists && exists.id !== exceptUserId) {
      throw new BadRequestException('Cet e-mail est déjà utilisé');
    }
  }

  async assertPhoneAvailable(phone: string, exceptUserId?: number): Promise<void> {
    const digits = this.phoneDigits(phone);
    if (digits.length < 6) return;
    const existing = await this.findByPhoneDigits(digits);
    if (existing && existing.id !== exceptUserId) {
      throw new BadRequestException('Ce numéro de téléphone est déjà utilisé');
    }
  }

  async nextAvailableStaffEmail(lastName: string, firstName: string, domain: string): Promise<string> {
    const base = buildStaffEmail(lastName, firstName, domain);
    const at = base.indexOf('@');
    const local = base.slice(0, at);
    const host = base.slice(at);
    let candidate = base;
    let n = 1;
    while (await this.usersRepo.findOne({ where: { email: candidate } })) {
      n += 1;
      candidate = `${local}${n}${host}`;
    }
    return candidate;
  }

  async updateOwnProfile(
    userId: number,
    params: Partial<{ first_name: string; last_name: string; email: string; phone: string; profile_photo_url: string }>,
  ): Promise<User> {
    const user = await this.findOne(userId);
    if (params.first_name !== undefined) {
      const v = params.first_name.trim();
      if (!v) throw new BadRequestException('Le prénom est requis');
      user.first_name = v;
    }
    if (params.last_name !== undefined) {
      const v = params.last_name.trim();
      if (!v) throw new BadRequestException('Le nom est requis');
      user.last_name = v;
    }
    if (params.email !== undefined) {
      const email = params.email.toLowerCase().trim();
      if (!email.includes('@')) throw new BadRequestException('E-mail invalide');
      await this.assertEmailAvailable(email, userId);
      user.email = email;
    }
    if (params.phone !== undefined) {
      const phone = params.phone.trim();
      if (!phone) throw new BadRequestException('Le téléphone est requis');
      await this.assertPhoneAvailable(phone, userId);
      user.phone = phone;
    }
    if (params.profile_photo_url !== undefined) {
      user.profile_photo_url = params.profile_photo_url.trim() || null;
    }
    const { role: _role, ...scalars } = user;
    await this.usersRepo.update(userId, {
      first_name: scalars.first_name,
      last_name: scalars.last_name,
      email: scalars.email,
      phone: scalars.phone,
      profile_photo_url: scalars.profile_photo_url,
    });
    this.syncKick.kick('user-self-profile');
    return this.findOne(userId);
  }

  async changeOwnPassword(userId: number, currentPassword: string, newPassword: string): Promise<User> {
    const user = await this.findOne(userId);
    const current = (currentPassword ?? '').trim();
    const next = (newPassword ?? '').trim();
    if (!(await this.validatePassword(user, current))) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }
    if (next.length < 6) {
      throw new BadRequestException('Le nouveau mot de passe doit faire au moins 6 caractères');
    }
    if (next === current) {
      throw new BadRequestException('Le nouveau mot de passe doit être différent de l’actuel');
    }
    if (next === DEFAULT_STAFF_PASSWORD) {
      throw new BadRequestException('Choisissez un mot de passe personnel, pas le mot de passe par défaut');
    }
    await this.usersRepo.update(userId, {
      password_hash: await bcrypt.hash(next, 10),
      must_change_password: false,
    });
    await this.revokeSessions(userId, 'password_self_changed');
    this.syncKick.kick('user-self-password');
    return this.findOne(userId);
  }

  async provisionTeachers(params: {
    teachers: { last_name: string; first_name: string; phone: string }[];
    email_domain?: string;
    password?: string;
  }): Promise<{
    created: { id: number; last_name: string; first_name: string; email: string; phone: string }[];
    skipped: { last_name: string; first_name: string; phone: string; reason: string }[];
  }> {
    const domain = (params.email_domain ?? DEFAULT_STAFF_EMAIL_DOMAIN).replace(/^@/, '').trim();
    const password = (params.password ?? DEFAULT_STAFF_PASSWORD).trim();
    const created: { id: number; last_name: string; first_name: string; email: string; phone: string }[] = [];
    const skipped: { last_name: string; first_name: string; phone: string; reason: string }[] = [];

    for (const raw of params.teachers) {
      const last_name = (raw.last_name ?? '').trim();
      const first_name = (raw.first_name ?? '').trim();
      const phone = (raw.phone ?? '').trim();
      if (!last_name || !first_name || !phone) {
        skipped.push({ last_name, first_name, phone, reason: 'nom, prénom et téléphone requis' });
        continue;
      }
      const digits = this.phoneDigits(phone);
      const existingPhone = await this.findByPhoneDigits(digits);
      if (existingPhone) {
        skipped.push({ last_name, first_name, phone, reason: `téléphone déjà utilisé (${existingPhone.email})` });
        continue;
      }
      const email = await this.nextAvailableStaffEmail(last_name, first_name, domain);
      const user = await this.createUser({
        last_name,
        first_name,
        phone,
        email,
        password,
        roleName: 'TEACHER',
        must_change_password: true,
      });
      created.push({
        id: user.id,
        last_name: user.last_name ?? last_name,
        first_name: user.first_name ?? first_name,
        email: user.email,
        phone: user.phone ?? phone,
      });
    }
    return { created, skipped };
  }
}
