import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserLinkedStudent } from './user-linked-student.entity';
import { Student } from '../students/student.entity';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { UsersService } from './users.service';
import { SyncKickService } from '../sync/sync-kick.service';
import { DEFAULT_STAFF_EMAIL_DOMAIN, DEFAULT_STAFF_PASSWORD } from './staff-account.constants';
import { slugEmailPart, splitPersonName } from './staff-email';

type GuardianHint = {
  phone: string;
  fullName: string;
  relationship: 'mother' | 'father' | 'responsible';
};

/**
 * Provisionne un compte PARENT à l’inscription, en utilisant le même lien
 * que l’écran Utilisateurs : `user_linked_student` / `linked_student_ids`.
 */
@Injectable()
export class ParentAccountService {
  private readonly logger = new Logger(ParentAccountService.name);

  constructor(
    private readonly users: UsersService,
    @InjectRepository(UserLinkedStudent)
    private readonly linkedRepo: Repository<UserLinkedStudent>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(SchoolProfile)
    private readonly schoolProfileRepo: Repository<SchoolProfile>,
    private readonly syncKick: SyncKickService,
  ) {}

  /**
   * Pose le lien parent → élève et **vérifie** qu’il est bien en base.
   * L’appelant (`attachGuardianQuietly`) avale les exceptions : sans cette
   * vérification, un échec du lien laissait un compte parent sans enfant, muet.
   * Le repli en SQL brut ne dépend d’aucun comportement de cascade TypeORM.
   */
  private async ensureLink(
    userId: number,
    studentId: string,
    reason: string,
  ): Promise<boolean> {
    try {
      await this.users.linkStudent(userId, studentId, false);
    } catch (err: any) {
      this.logger.warn(
        `Lien parent ${userId} → élève ${studentId} (${reason}) : ${err?.message || err}`,
      );
    }
    if (await this.hasLink(userId, studentId)) return true;

    try {
      await this.linkedRepo.query(
        `INSERT INTO user_linked_student (user_id, student_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, student_id) DO NOTHING`,
        [userId, studentId],
      );
    } catch (err: any) {
      this.logger.error(
        `Repli SQL du lien parent ${userId} → élève ${studentId} (${reason}) : ${err?.message || err}`,
      );
    }
    if (await this.hasLink(userId, studentId)) return true;

    this.logger.error(
      `Compte parent ${userId} sans lien vers l’élève ${studentId} (${reason})`,
    );
    return false;
  }

  private async hasLink(userId: number, studentId: string): Promise<boolean> {
    const n = await this.linkedRepo.count({
      where: { user: { id: userId }, student: { id: studentId } },
    });
    return n > 0;
  }

  /**
   * Rattache un parent existant (téléphone / nom) à l’élève.
   * @param provision si true (inscription seulement) : crée un compte PARENT
   *   quand aucun parent n’existe. Jamais à la MAJ élève — sinon une
   *   suppression de compte parent est annulée au prochain save élève.
   */
  async ensureForStudent(
    student: Student,
    opts?: { provision?: boolean },
  ): Promise<void> {
    const provision = opts?.provision === true;
    const hints = this.collectHints(student);
    let linked = false;

    for (const hint of hints) {
      const user = await this.users.findByPhoneDigits(this.digits(hint.phone));
      if (!user) continue;
      await this.ensureLink(user.id, student.id, 'tuteur retrouvé par téléphone');
      // Le compte existe : ne pas en créer un second même si le lien a échoué.
      linked = true;
    }
    if (!linked) {
      for (const hint of hints) {
        if (!hint.fullName) continue;
        const user = await this.findParentByPersonName(hint.fullName);
        if (!user) continue;
        await this.ensureLink(user.id, student.id, 'tuteur retrouvé par nom');
        linked = true;
      }
    }
    if (linked) {
      this.syncKick.kick('parent-link');
      return;
    }

    if (!provision) {
      return;
    }

    const existingLinks = await this.linkedRepo.find({
      where: { student: { id: student.id } },
      relations: ['user'],
    });

    const toCreate = hints[0];
    if (toCreate) {
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
        await this.ensureLink(placeholder.id, student.id, 'placeholder complété');
        this.syncKick.kick('parent-upgrade');
        return;
      }
      const guardian = await this.createGuardian(toCreate, student);
      await this.ensureLink(guardian.id, student.id, 'compte tuteur créé');
      this.syncKick.kick('parent-create');
      return;
    }

    if (existingLinks.length > 0) return;

    const created = await this.createChildNamedPlaceholder(student);
    await this.ensureLink(created.id, student.id, 'compte placeholder créé');
    this.syncKick.kick('parent-placeholder');
  }

  /**
   * Après suppression d’élève : si un compte PARENT n’a plus aucun enfant lié,
   * le supprimer (tombstone + sync) pour éviter des orphelins qui se re-poussent.
   * Ne touche jamais au staff (TEACHER, admins, etc.).
   */
  async deleteOrphanParentsForStudent(studentId: string): Promise<number> {
    const links = await this.linkedRepo.find({
      where: { student: { id: studentId } },
      relations: ['user', 'user.role'],
    });
    const parentIds = [
      ...new Set(
        links
          .map((l) => l.user)
          .filter((u) => u && (u.role?.name ?? '').toUpperCase() === 'PARENT')
          .map((u) => u.id),
      ),
    ];
    let deleted = 0;
    for (const userId of parentIds) {
      const remaining = await this.linkedRepo.count({
        where: { user: { id: userId } },
      });
      // Le lien vers cet élève existe encore ici (appelé avant remove élève) :
      // orphelin = 1 seul lien (cet élève) ou 0.
      if (remaining > 1) continue;
      try {
        await this.users.deleteUser(userId);
        deleted += 1;
        this.logger.log(`Parent orphelin ${userId} supprimé (plus d’élève lié)`);
      } catch (err: any) {
        this.logger.warn(
          `Purge parent orphelin ${userId}: ${err?.message || err}`,
        );
      }
    }
    return deleted;
  }

  /**
   * Rattache les comptes PARENT restés sans enfant à l’élève dont ils portent
   * le nom. C’est l’inverse exact de `createChildNamedPlaceholder` : le compte
   * reprend nom + prénom de l’enfant, donc la clé de nom identifie l’élève.
   * Idempotent — à lancer après une inscription en masse ou une reprise de base.
   */
  async repairOrphanParentLinks(): Promise<{
    linked: number;
    unmatched: number;
    orphans: number;
  }> {
    const parents = await this.users.findParents();
    const orphans: User[] = [];
    for (const p of parents) {
      const n = await this.linkedRepo.count({ where: { user: { id: p.id } } });
      if (n === 0) orphans.push(p);
    }
    if (orphans.length === 0) {
      return { linked: 0, unmatched: 0, orphans: 0 };
    }

    const students = await this.studentRepo.find();
    const linkedStudentIds = new Set(
      (
        await this.linkedRepo
          .createQueryBuilder('l')
          .select('l.student_id', 'student_id')
          .getRawMany<{ student_id: string }>()
      ).map((r) => r.student_id),
    );

    // Élèves sans aucun parent d’abord : un compte orphelin doit servir un
    // enfant qui n’a personne avant de doubler un enfant déjà couvert.
    const freeByName = new Map<string, string[]>();
    const anyByName = new Map<string, string[]>();
    for (const s of [...students].sort((a, b) => a.id.localeCompare(b.id))) {
      const key = this.nameKey(s.last_name, s.first_name);
      if (!anyByName.has(key)) anyByName.set(key, []);
      anyByName.get(key)!.push(s.id);
      if (linkedStudentIds.has(s.id)) continue;
      if (!freeByName.has(key)) freeByName.set(key, []);
      freeByName.get(key)!.push(s.id);
    }

    let linked = 0;
    let unmatched = 0;
    for (const parent of [...orphans].sort((a, b) => a.id - b.id)) {
      const key = this.nameKey(parent.last_name, parent.first_name);
      const studentId = freeByName.get(key)?.shift() ?? anyByName.get(key)?.[0];
      if (!studentId) {
        unmatched += 1;
        this.logger.warn(
          `Parent orphelin ${parent.id} (${parent.last_name} ${parent.first_name}) : aucun élève homonyme`,
        );
        continue;
      }
      if (await this.ensureLink(parent.id, studentId, 'réparation par nom')) {
        linked += 1;
      } else {
        unmatched += 1;
      }
    }
    if (linked > 0) this.syncKick.kick('parent-link-repair');
    this.logger.log(
      `Réparation liens parents : ${linked} rattaché(s), ${unmatched} en échec sur ${orphans.length} orphelin(s)`,
    );
    return { linked, unmatched, orphans: orphans.length };
  }

  /** Clé d’appariement : même règle que l’e-mail généré à la création. */
  private nameKey(lastName?: string | null, firstName?: string | null): string {
    return `${slugEmailPart(lastName ?? '')}.${slugEmailPart(firstName ?? '')}`;
  }

  /**
   * Purge tous les PARENT sans aucun lien `user_linked_student` (orphelins).
   */
  async deleteAllOrphanParentAccounts(): Promise<{ deleted: number; ids: number[] }> {
    const parents = await this.users.findParents();
    const ids: number[] = [];
    for (const p of parents) {
      const n = await this.linkedRepo.count({ where: { user: { id: p.id } } });
      if (n > 0) continue;
      await this.users.deleteUser(p.id);
      ids.push(p.id);
    }
    this.logger.warn(`Purge PARENT orphelins: ${ids.length}`);
    return { deleted: ids.length, ids };
  }

  /**
   * Purge de test : supprime tous les comptes rôle PARENT (+ liens élèves).
   * N’affecte pas le staff (enseignants, admins, etc.).
   */
  async deleteAllParentAccounts(): Promise<{ deleted: number; ids: number[] }> {
    const parents = await this.users.findParents();
    const ids = parents.map((p) => p.id);
    for (const id of ids) {
      await this.users.deleteUser(id);
    }
    this.logger.warn(`Purge PARENT: ${ids.length} compte(s) supprimé(s)`);
    return { deleted: ids.length, ids };
  }

  private collectHints(student: Student): GuardianHint[] {
    const out: GuardianHint[] = [];
    const add = (
      phone: string | undefined,
      fullName: string | undefined,
      relationship: GuardianHint['relationship'],
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
      /* ignore */
    }
    return raw.replace(/^@/, '').replace(/^www\./, '');
  }

  private namesForGuardian(hint: GuardianHint, student: Student): { last_name: string; first_name: string } {
    if (hint.fullName) return splitPersonName(hint.fullName);
    return { last_name: student.last_name, first_name: student.first_name };
  }

  private async createGuardian(hint: GuardianHint, student: Student): Promise<User> {
    const domain = await this.resolveEmailDomain();
    const names = this.namesForGuardian(hint, student);
    const email = await this.users.nextAvailableStaffEmail(names.last_name, names.first_name, domain);
    this.logger.log(`Compte parent ${email} (${hint.relationship}) → élève ${student.id}`);
    return this.users.createUser({
      last_name: names.last_name,
      first_name: names.first_name,
      phone: hint.phone,
      email,
      password: DEFAULT_STAFF_PASSWORD,
      roleName: 'PARENT',
      must_change_password: true,
      linked_student_ids: [student.id],
    });
  }

  private async createChildNamedPlaceholder(student: Student): Promise<User> {
    const domain = await this.resolveEmailDomain();
    const email = await this.users.nextAvailableStaffEmail(student.last_name, student.first_name, domain);
    this.logger.log(`Compte parent placeholder ${email} (nom élève) → ${student.id}`);
    return this.users.createUser({
      last_name: student.last_name,
      first_name: student.first_name,
      email,
      password: DEFAULT_STAFF_PASSWORD,
      roleName: 'PARENT',
      must_change_password: true,
      linked_student_ids: [student.id],
    });
  }
}
