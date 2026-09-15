import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SchoolProfile } from './school-profile.entity';
import { SchoolSignature } from './school-signature.entity';
import {
  EXTRA_SIGNATURE_SLOT,
  FIXED_SIGNATURE_SLOTS,
} from './signature-slots';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Period } from '../period/period.entity';
import { Class } from '../classes/class.entity';
import { Student } from '../students/student.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { SyncKickService } from '../sync/sync-kick.service';
import { TEACHER_ROLE_NAMES } from '../roles/roles.constants';

export type DashboardStats = {
  classesCount: number;
  studentsCount: number;
  teachersCount: number;
};

export type CurrentContext = {
  current_academic_year_id: string | null;
  current_academic_year_name: string | null;
  current_period_id: string | null;
  current_period_name: string | null;
  current_preschool_period_id: string | null;
  current_preschool_period_name: string | null;
};

export type SignatureInput = {
  id?: string;
  slot_key: string;
  signer_name?: string;
  signer_role?: string;
  image_url?: string | null;
  sort_order?: number;
};

export type SignatureDto = {
  id: string | null;
  slot_key: string;
  signer_name: string;
  signer_role: string;
  image_url: string | null;
  sort_order: number;
  is_fixed: boolean;
};

@Injectable()
export class SchoolProfileService implements OnModuleInit {
  constructor(
    @InjectRepository(SchoolProfile)
    private readonly profileRepo: Repository<SchoolProfile>,
    @InjectRepository(SchoolSignature)
    private readonly signatureRepo: Repository<SchoolSignature>,
    @InjectRepository(AcademicYear)
    private readonly academicYearRepo: Repository<AcademicYear>,
    @InjectRepository(Period)
    private readonly periodRepo: Repository<Period>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly syncKick: SyncKickService,
  ) {}

  async onModuleInit() {
    await this.dedupeProfiles();
  }

  /**
   * Profil canonique = plus ancien créé. Fusionne les champs du plus récent
   * puis supprime les doublons.
   */
  async dedupeProfiles(): Promise<SchoolProfile | null> {
    const all = await this.profileRepo.find({
      order: { created_at: 'ASC' },
    });
    if (all.length === 0) return null;
    if (all.length === 1) return all[0];

    const keep = all[0];
    const newest = all.reduce((a, b) =>
      a.updated_at.getTime() >= b.updated_at.getTime() ? a : b,
    );
    keep.name = newest.name || keep.name;
    keep.slogan = newest.slogan ?? keep.slogan;
    keep.domain = newest.domain ?? keep.domain;
    keep.logo_url = newest.logo_url ?? keep.logo_url;
    // Ne pas écraser un contact renseigné par un null (doublon sync incomplet).
    keep.address = newest.address ?? keep.address;
    keep.phone = newest.phone ?? keep.phone;
    keep.email = newest.email ?? keep.email;
    keep.primary_color = newest.primary_color || keep.primary_color;
    keep.secondary_color = newest.secondary_color || keep.secondary_color;
    keep.active = newest.active;
    keep.current_academic_year_id =
      newest.current_academic_year_id ?? keep.current_academic_year_id;
    keep.current_period_id = newest.current_period_id ?? keep.current_period_id;
    keep.current_preschool_period_id =
      newest.current_preschool_period_id ?? keep.current_preschool_period_id;
    keep.updated_at = newest.updated_at;
    await this.profileRepo.save(keep);

    const dropIds = all.filter((p) => p.id !== keep.id).map((p) => p.id);
    if (dropIds.length) {
      await this.signatureRepo.update(
        { school_profile_id: In(dropIds) },
        { school_profile_id: keep.id },
      );
    }

    await this.profileRepo
      .createQueryBuilder()
      .delete()
      .where('id != :id', { id: keep.id })
      .execute();

    return keep;
  }

  async getProfile(): Promise<SchoolProfile | null> {
    const [p] = await this.profileRepo.find({
      order: { created_at: 'ASC' },
      take: 1,
    });
    return p ?? null;
  }

  async ensureProfile(): Promise<SchoolProfile> {
    await this.dedupeProfiles();
    const existing = await this.getProfile();
    if (existing) return existing;
    const profile = this.profileRepo.create({
      name: 'Shekinah SchoolMatrix',
      domain: 'localhost',
      primary_color: '#1e293b',
      secondary_color: '#334155',
      active: true,
    });
    return this.profileRepo.save(profile);
  }

  toSchoolDto(profile: SchoolProfile) {
    return {
      id: profile.id,
      name: profile.name,
      slogan: profile.slogan ?? null,
      domain: profile.domain ?? null,
      logo_url: profile.logo_url ?? null,
      address: profile.address ?? null,
      phone: profile.phone ?? null,
      email: profile.email ?? null,
      primary_color: profile.primary_color,
      secondary_color: profile.secondary_color,
      active: profile.active,
      current_academic_year_id: profile.current_academic_year_id ?? null,
      current_period_id: profile.current_period_id ?? null,
      current_preschool_period_id: profile.current_preschool_period_id ?? null,
    };
  }

  async updateProfile(params: {
    name?: string;
    slogan?: string;
    domain?: string;
    logo_url?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    primary_color?: string;
    secondary_color?: string;
    active?: boolean;
    current_academic_year_id?: string | null;
    current_period_id?: string | null;
    current_preschool_period_id?: string | null;
  }): Promise<SchoolProfile> {
    const profile = await this.ensureProfile();
    if (params.name !== undefined) profile.name = params.name;
    if (params.slogan !== undefined) {
      profile.slogan = params.slogan === '' ? null : params.slogan ?? null;
    }
    if (params.domain !== undefined) profile.domain = params.domain;
    if (params.logo_url !== undefined) profile.logo_url = params.logo_url ?? null;
    if (params.address !== undefined) {
      profile.address = params.address === '' ? null : params.address ?? null;
    }
    if (params.phone !== undefined) {
      profile.phone = params.phone === '' ? null : params.phone ?? null;
    }
    if (params.email !== undefined) {
      profile.email = params.email === '' ? null : params.email ?? null;
    }
    if (params.primary_color !== undefined) profile.primary_color = params.primary_color;
    if (params.secondary_color !== undefined) profile.secondary_color = params.secondary_color;
    if (params.active !== undefined) profile.active = params.active;
    if (params.current_academic_year_id !== undefined) {
      profile.current_academic_year_id = params.current_academic_year_id || null;
    }
    if (params.current_period_id !== undefined) {
      profile.current_period_id = params.current_period_id || null;
    }
    if (params.current_preschool_period_id !== undefined) {
      profile.current_preschool_period_id = params.current_preschool_period_id || null;
    }
    const saved = await this.profileRepo.save(profile);
    this.syncKick.kick('school-profile');
    return saved;
  }

  private mapSignature(s: SchoolSignature): SignatureDto {
    const isFixed = FIXED_SIGNATURE_SLOTS.some((f) => f.slot_key === s.slot_key);
    return {
      id: s.id,
      slot_key: s.slot_key,
      signer_name: s.signer_name ?? '',
      signer_role: s.signer_role ?? '',
      image_url: s.image_url ?? null,
      sort_order: s.sort_order,
      is_fixed: isFixed,
    };
  }

  /**
   * Liste les signatures : 5 emplacements fixes (même vides) + extras enregistrés.
   */
  async listSignatures(): Promise<SignatureDto[]> {
    const profile = await this.ensureProfile();
    const rows = await this.signatureRepo.find({
      where: { school_profile_id: profile.id },
      order: { sort_order: 'ASC', created_at: 'ASC' },
    });
    const bySlot = new Map<string, SchoolSignature>();
    const extras: SchoolSignature[] = [];
    for (const row of rows) {
      if (row.slot_key === EXTRA_SIGNATURE_SLOT) {
        extras.push(row);
      } else if (!bySlot.has(row.slot_key)) {
        bySlot.set(row.slot_key, row);
      }
    }

    const result: SignatureDto[] = FIXED_SIGNATURE_SLOTS.map((slot) => {
      const existing = bySlot.get(slot.slot_key);
      if (existing) return this.mapSignature(existing);
      return {
        id: null,
        slot_key: slot.slot_key,
        signer_name: '',
        signer_role: slot.default_role,
        image_url: null,
        sort_order: slot.sort_order,
        is_fixed: true,
      };
    });

    for (const extra of extras) {
      result.push(this.mapSignature(extra));
    }
    return result;
  }

  /**
   * Remplace / upsert les signatures envoyées par le formulaire.
   * Les lignes absentes de la liste (vidées ou retirées) sont supprimées.
   */
  async replaceSignatures(inputs: SignatureInput[]): Promise<SignatureDto[]> {
    const profile = await this.ensureProfile();
    const existing = await this.signatureRepo.find({
      where: { school_profile_id: profile.id },
    });
    const existingById = new Map(existing.map((s) => [s.id, s]));
    const keepIds = new Set<string>();
    const fixedKeys = new Set<string>(
      FIXED_SIGNATURE_SLOTS.map((s) => s.slot_key),
    );

    let extraOrder = 100;
    for (const input of inputs) {
      const isFixed = fixedKeys.has(input.slot_key);
      const slotKey = isFixed ? input.slot_key : EXTRA_SIGNATURE_SLOT;
      const defaultRole =
        FIXED_SIGNATURE_SLOTS.find((s) => s.slot_key === slotKey)
          ?.default_role ?? '';
      const signerName = (input.signer_name ?? '').trim();
      const signerRole = (input.signer_role ?? '').trim() || defaultRole;
      const imageUrl = input.image_url ? input.image_url : null;
      const sortOrder =
        input.sort_order ??
        (isFixed
          ? FIXED_SIGNATURE_SLOTS.find((s) => s.slot_key === slotKey)!.sort_order
          : extraOrder++);

      // Emplacement vide : ne pas persister (sera supprimé s'il existait)
      if (!signerName && !imageUrl) continue;

      let row: SchoolSignature | undefined;
      if (input.id && existingById.has(input.id)) {
        row = existingById.get(input.id);
      } else if (isFixed) {
        row = existing.find((e) => e.slot_key === slotKey);
      }

      if (!row) {
        row = this.signatureRepo.create({
          school_profile_id: profile.id,
          slot_key: slotKey,
        });
      }
      row.slot_key = slotKey;
      row.signer_name = signerName;
      row.signer_role = signerRole;
      row.image_url = imageUrl;
      row.sort_order = sortOrder;
      const saved = await this.signatureRepo.save(row);
      keepIds.add(saved.id);
    }

    const toDelete = existing.filter((e) => !keepIds.has(e.id));
    if (toDelete.length) {
      await this.signatureRepo.remove(toDelete);
    }

    this.syncKick.kick('school-signature');
    return this.listSignatures();
  }

  async deleteSignature(id: string): Promise<void> {
    const row = await this.signatureRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Signature introuvable');
    await this.signatureRepo.remove(row);
    this.syncKick.kick('school-signature');
  }

  async getCurrentContext(): Promise<CurrentContext> {
    const profile = await this.getProfile();
    const yearId = profile?.current_academic_year_id ?? null;
    const periodId = profile?.current_period_id ?? null;
    const preschoolPeriodId = profile?.current_preschool_period_id ?? null;
    let yearName: string | null = null;
    let periodName: string | null = null;
    let preschoolPeriodName: string | null = null;
    if (yearId) {
      const ay = await this.academicYearRepo.findOne({ where: { id: yearId } });
      yearName = ay?.name ?? null;
    }
    if (periodId) {
      const p = await this.periodRepo.findOne({ where: { id: periodId } });
      periodName = p?.name ?? null;
    }
    if (preschoolPeriodId) {
      const p = await this.periodRepo.findOne({ where: { id: preschoolPeriodId } });
      preschoolPeriodName = p?.name ?? null;
    }
    return {
      current_academic_year_id: yearId,
      current_academic_year_name: yearName,
      current_period_id: periodId,
      current_period_name: periodName,
      current_preschool_period_id: preschoolPeriodId,
      current_preschool_period_name: preschoolPeriodName,
    };
  }

  /** Statistiques tableau de bord (réservé directeurs / superadmin). */
  async getDashboardStats(): Promise<DashboardStats> {
    const [classesCount, studentsCount, teachersCount] = await Promise.all([
      this.classRepo.count(),
      this.studentRepo.count(),
      this.userRepo
        .createQueryBuilder('u')
        .innerJoin('u.role', 'r')
        .where('UPPER(r.name) IN (:...roles)', { roles: TEACHER_ROLE_NAMES })
        .andWhere('u.active = :active', { active: true })
        .getCount(),
    ]);
    return { classesCount, studentsCount, teachersCount };
  }
}
