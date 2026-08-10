import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { UserLinkedStudent } from './user-linked-student.entity';
import { Role } from '../roles/role.entity';
import { Student } from '../students/student.entity';
import { SyncKickService } from '../sync/sync-kick.service';

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
    private readonly syncKick: SyncKickService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  async findByEmailOrPhone(login: string): Promise<User | null> {
    const trimmed = login.trim();
    if (!trimmed) return null;
    const byEmail = await this.findByEmail(trimmed);
    if (byEmail) return byEmail;
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 6) return null;
    const users = await this.usersRepo
      .createQueryBuilder('u')
      .where("REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g') = :digits", { digits: digitsOnly })
      .getMany();
    return users[0] ?? null;
  }

  async countUsers(): Promise<number> {
    return this.usersRepo.count();
  }

  async findAll(): Promise<User[]> {
    return this.usersRepo.find({ order: { id: 'ASC' } });
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
    const role = await this.rolesRepo.findOne({ where: { name: roleName } });
    if (!role) throw new BadRequestException(`Role not found: ${roleName}`);
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
    });
    const saved = await this.usersRepo.save(user);
    if (params.linked_student_ids?.length) {
      const uniqueIds = [...new Set(params.linked_student_ids.filter(Boolean))];
      for (const studentId of uniqueIds) {
        const student = await this.studentRepo.findOne({ where: { id: studentId } });
        if (student) {
          const link = this.linkedStudentRepo.create({ user: { id: saved.id } as User, student: { id: studentId } as Student });
          await this.linkedStudentRepo.save(link);
        }
      }
    }
    this.syncKick.kick('user-create');
    return saved;
  }

  async setUserRole(userId: number, roleName: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.rolesRepo.findOne({ where: { name: roleName.toUpperCase().trim() } });
    if (!role) throw new BadRequestException(`Role not found: ${roleName}`);
    user.role = role;
    const saved = await this.usersRepo.save(user);
    this.syncKick.kick('user-role');
    return saved;
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
    if (params.first_name !== undefined) user.first_name = params.first_name.trim() || undefined;
    if (params.last_name !== undefined) user.last_name = params.last_name.trim() || undefined;
    if (params.email !== undefined) {
      const email = params.email.toLowerCase().trim();
      const exists = await this.usersRepo.findOne({ where: { email } });
      if (exists && exists.id !== userId) throw new BadRequestException('Email already exists');
      user.email = email;
    }
    if (params.address !== undefined) user.address = params.address.trim() || undefined;
    if (params.phone !== undefined) user.phone = params.phone.trim() || undefined;
    if (params.whatsapp !== undefined) user.whatsapp = params.whatsapp.trim() || undefined;
    if (params.active !== undefined) user.active = params.active;
    if (params.profile_photo_url !== undefined) user.profile_photo_url = params.profile_photo_url.trim() || undefined;
    if (params.cover_photo_url !== undefined) user.cover_photo_url = params.cover_photo_url.trim() || undefined;
    if (params.order_number !== undefined) user.order_number = params.order_number.trim() || null;
    if (params.password !== undefined && params.password.length > 0) {
      user.password_hash = await bcrypt.hash(params.password, 10);
    }
    if (params.linked_student_ids !== undefined) {
      await this.linkedStudentRepo.delete({ user: { id: userId } });
      const uniqueIds = [...new Set(params.linked_student_ids.filter(Boolean))];
      for (const studentId of uniqueIds) {
        const student = await this.studentRepo.findOne({ where: { id: studentId } });
        if (student) {
          const link = this.linkedStudentRepo.create({ user: { id: userId } as User, student: { id: studentId } as Student });
          await this.linkedStudentRepo.save(link);
        }
      }
    }
    const saved = await this.usersRepo.save(user);
    this.syncKick.kick('user-update');
    return saved;
  }

  async getLinkedStudentIds(userId: number): Promise<string[]> {
    const links = await this.linkedStudentRepo.find({
      where: { user: { id: userId } },
      relations: ['student'],
    });
    return links.map((l) => l.student.id);
  }

  async getLinkedStudentsForFiche(userId: number): Promise<{ id: string; order_number: string | null; first_name: string; last_name: string; class_id: string; class_name: string }[]> {
    const links = await this.linkedStudentRepo.find({
      where: { user: { id: userId } },
      relations: ['student', 'student.class'],
    });
    return links.map((l) => ({
      id: l.student.id,
      order_number: l.student.order_number ?? null,
      first_name: l.student.first_name,
      last_name: l.student.last_name,
      class_id: l.student.class?.id ?? '',
      class_name: l.student.class?.name ?? '—',
    }));
  }

  async deleteUser(userId: number): Promise<{ deleted: boolean }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.usersRepo.remove(user);
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
    user.password_hash = await bcrypt.hash(pwd, 10);
    const saved = await this.usersRepo.save(user);
    this.syncKick.kick('user-password');
    return saved;
  }
}
