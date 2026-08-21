import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserLinkedStudent } from './user-linked-student.entity';
import { Student } from '../students/student.entity';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { UsersService } from './users.service';
import { SyncKickService } from '../sync/sync-kick.service';
import {
  DEFAULT_STAFF_EMAIL_DOMAIN,
  DEFAULT_STAFF_PASSWORD,
} from './staff-account.constants';
import { slugEmailPart, splitPersonName } from './staff-email';

type GuardianRelationship = 'mother' | 'father' | 'responsible';

type GuardianHint = {
  phone: string;
  fullName: string;
  relationship: GuardianRelationship;
};

/** Renvoyé au desktop pour afficher les identifiants après une inscription. */
export type EnsureParentAccountResult = {
  user: User;
  created: boolean;
  email: string;
  phone: string | null;
  temporary_password: string | null;
};

/**
 * Provisionne un compte PARENT à l'inscription, en utilisant le même lien que
 * l'écran Utilisateurs : `user_linked_student` / `linked_student_ids`.
 */
@Injectable()
export class ParentAccountService {
  private readonly logger = new Logger(ParentAccountService.name);

  constructor(
    private readonly users: UsersService,
    @InjectRepository(UserLinkedStudent)
    private readonly linkedRepo: Repository<UserLinkedStudent>,
    @InjectRepository(SchoolProfile)
    private readonly schoolProfileRepo: Repository<SchoolProfile>,
    private readonly syncKick: SyncKickService,
  ) {}

  /**
   * Rattache un parent existant (téléphone puis nom) à l'élève.
   *
   * @param provision si true (inscription uniquement) : crée un compte PARENT
   *   quand aucun parent n'existe. Jamais à la mise à jour d'un élève, sinon
   *   la suppression d'un compte parent est annulée au prochain enregistrement.
   */
  async ensureForStudent(
    student: Student,
    opts?: { provision?: boolean },
  ): Promise<EnsureParentAccountResult | null> {
    const provision = opts?.provision === true;
    const hints = this.collectHints(student);

    // 1. Fratrie : un numéro déjà connu = un seul compte pour plusieurs enfants.
    for (const hint of hints) {
      const user = await this.users.findByPhoneDigits(this.digits(hint.phone));
      if (!user) continue;
      await this.users.linkStudent(
        user.id,
        student.id,
        hint.relationship,
        false,
      );
      this.syncKick.kick('parent-link');
      return this.existingResult(user);
    }

    // 2. Repli sur le nom, pour les fiches saisies sans téléphone cohérent.
    for (const hint of hints) {
      if (!hint.fullName) continue;
      const user = await this.findParentByPersonName(hint.fullName);
      if (!user) continue;
      await this.users.linkStudent(
        user.id,
        student.id,
        hint.relationship,
        false,
      );
      this.syncKick.kick('parent-link');
      return this.existingResult(user);
    }

    if (!provision) return null;

    const existingLinks = await this.linkedRepo.find({
      where: { student: { id: student.id } },
      relations: ['user'],
    });

    const toCreate = hints[0];
    if (toCreate) {
      // Fiche importée sans téléphone puis complétée : enrichir plutôt que dupliquer.
      const placeholder = existingLinks
        .map((l) => l.user)
        .find((u) => u && !this.hasRealPhone(u.phone));
      if (placeholder) {
        const names = this.namesForGuardian(toCreate, student);
        await this.users.updateUser(placeholder.id, {
          phone: toCreate.phone,
          last_name: names.last_name,
          first_name: names.first_name,
        });
        await this.users.linkStudent(
          placeholder.id,
          student.id,
          toCreate.relationship,
          false,
        );
        this.syncKick.kick('parent-upgrade');
        return this.existingResult(await this.users.findOne(placeholder.id));
      }
      const created = await this.createGuardian(toCreate, student);
      this.syncKick.kick('parent-create');
      return this.createdResult(created);
    }

    if (existingLinks.length > 0) return null;

    const placeholder = await this.createChildNamedPlaceholder(student);
    this.syncKick.kick('parent-placeholder');
    return this.createdResult(placeholder);
  }

  private existingResult(user: User): EnsureParentAccountResult {
    return {
      user,
      created: false,
      email: user.email,
      phone: user.phone,
      temporary_password: null,
    };
  }

  private createdResult(user: User): EnsureParentAccountResult {
    return {
      user,
      created: true,
      email: user.email,
      phone: user.phone,
      temporary_password: DEFAULT_STAFF_PASSWORD,
    };
  }

  private collectHints(student: Student): GuardianHint[] {
    const out: GuardianHint[] = [];
    const add = (
      phone: string | undefined | null,
      fullName: string | undefined | null,
      relationship: GuardianRelationship,
    ) => {
      if (!this.hasRealPhone(phone)) return;
      out.push({
        phone: phone!.trim(),
        fullName: (fullName ?? '').trim(),
        relationship,
      });
    };
    add(student.mother_phone, student.mother_name, 'mother');
    add(student.father_phone, student.father_name, 'father');
    add(student.responsible_phone, student.responsible_name, 'responsible');
    return out;
  }

  private async findParentByPersonName(fullName: string): Promise<User | null> {
    const want = slugEmailPart(fullName);
    if (want.length < 4) return null;
    const parents = await this.users.findParents();
    for (const u of parents) {
      const a = slugEmailPart(`${u.last_name ?? ''} ${u.first_name ?? ''}`);
      const b = slugEmailPart(`${u.first_name ?? ''} ${u.last_name ?? ''}`);
      if (a === want || b === want) return u;
    }
    return null;
  }

  private digits(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private hasRealPhone(phone?: string | null): boolean {
    const d = this.digits(phone ?? '');
    if (d.length < 6) return false;
    if (/^0+$/.test(d)) return false;
    return true;
  }

  private async resolveEmailDomain(): Promise<string> {
    const rows = await this.schoolProfileRepo.find({
      order: { created_at: 'ASC' },
      take: 1,
    });
    const raw = (rows[0]?.domain ?? '').trim();
    if (!raw || raw === 'localhost' || !raw.includes('.')) {
      return DEFAULT_STAFF_EMAIL_DOMAIN;
    }
    try {
      if (raw.includes('://')) {
        return new URL(raw).hostname.replace(/^www\./, '');
      }
    } catch {
      /* domaine libre saisi à la main */
    }
    return raw.replace(/^@/, '').replace(/^www\./, '');
  }

  private namesForGuardian(
    hint: GuardianHint,
    student: Student,
  ): { last_name: string; first_name: string } {
    if (hint.fullName) return splitPersonName(hint.fullName);
    return { last_name: student.last_name, first_name: student.first_name };
  }

  private async createGuardian(
    hint: GuardianHint,
    student: Student,
  ): Promise<User> {
    const domain = await this.resolveEmailDomain();
    const names = this.namesForGuardian(hint, student);
    const email = await this.users.nextAvailableStaffEmail(
      names.last_name,
      names.first_name,
      domain,
    );
    this.logger.log(
      `Compte parent ${email} (${hint.relationship}) → élève ${student.id}`,
    );
    const user = await this.users.createUser({
      last_name: names.last_name,
      first_name: names.first_name,
      phone: hint.phone,
      email,
      password: DEFAULT_STAFF_PASSWORD,
      roleName: 'PARENT',
      must_change_password: true,
    });
    await this.users.linkStudent(
      user.id,
      student.id,
      hint.relationship,
      false,
    );
    return user;
  }

  /** Import PDF sans contact exploitable : compte au nom de l'élève. */
  private async createChildNamedPlaceholder(student: Student): Promise<User> {
    const domain = await this.resolveEmailDomain();
    const email = await this.users.nextAvailableStaffEmail(
      student.last_name,
      student.first_name,
      domain,
    );
    this.logger.log(
      `Compte parent provisoire ${email} (nom élève) → ${student.id}`,
    );
    const user = await this.users.createUser({
      last_name: student.last_name,
      first_name: student.first_name,
      email,
      password: DEFAULT_STAFF_PASSWORD,
      roleName: 'PARENT',
      must_change_password: true,
    });
    await this.users.linkStudent(user.id, student.id, 'student', false);
    return user;
  }
}
