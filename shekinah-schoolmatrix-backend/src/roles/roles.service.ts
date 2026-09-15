import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from './role.entity';
import {
  DEFAULT_ROLE_EDUCATION_LEVELS,
  PERMS_PEDAGOGIQUE,
  PERMS_SECRETAIRE,
  PERMS_SURVEILLANT,
  TEACHER_ROLE_NAMES,
  isTeacherRoleName,
} from './roles.constants';
import {
  LEVELS_PEDAGOGIQUE_PRIMAIRE,
  LEVELS_PEDAGOGIQUE_SECONDAIRE,
  educationLevelsEqual,
  normalizeEducationLevels,
} from './education-levels';

const FULL = ['full_access'];

const DEFAULT_ROLES: {
  name: string;
  description: string;
  permissions?: string[];
  education_levels?: string[] | null;
}[] = [
  {
    name: 'SUPER_ADMIN',
    description: 'Technicien / maintenance — accès total',
    permissions: FULL,
  },
  {
    name: 'DIRECTEUR_GENERAL',
    description: 'Directeur général — accès total, tous les niveaux',
    permissions: FULL,
  },
  {
    name: 'DIRECTEUR_ADMINISTRATIF',
    description: 'Directeur administratif — accès total, tous les niveaux',
    permissions: FULL,
  },
  {
    name: 'ADMINISTRATEUR',
    description: 'Administrateur — accès total, tous les niveaux',
    permissions: FULL,
  },
  {
    name: 'SCHOOL_ADMIN',
    description: 'Alias Administrateur (rétrocompatibilité)',
    permissions: FULL,
  },
  {
    name: 'DIRECTEUR_PEDAGOGIQUE',
    description: 'Directeur / Directrice pédagogique — tous les cycles (école sans découpage)',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: null,
  },
  {
    name: 'DIRECTEUR_PEDAGOGIQUE_PRESCOLAIRE',
    description: 'Directeur / Directrice pédagogique — préscolaire',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: ['PRESCOLAIRE'],
  },
  {
    name: 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL',
    description:
      'Directeur / Directrice pédagogique du primaire — 1er et 2e cycles fondamental',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: [...LEVELS_PEDAGOGIQUE_PRIMAIRE],
  },
  {
    name: 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_2',
    description:
      'Alias Directeur pédagogique du primaire (1er et 2e cycles fondamental)',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: [...LEVELS_PEDAGOGIQUE_PRIMAIRE],
  },
  {
    name: 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_3',
    description:
      'Alias Directeur pédagogique du secondaire (3e cycle fondamental et secondaire)',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: [...LEVELS_PEDAGOGIQUE_SECONDAIRE],
  },
  {
    name: 'DIRECTEUR_PEDAGOGIQUE_SECONDAIRE',
    description:
      'Directeur / Directrice pédagogique du secondaire — 3e cycle fondamental et secondaire',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: [...LEVELS_PEDAGOGIQUE_SECONDAIRE],
  },
  {
    name: 'DIRECTEUR_PEDAGOGIQUE_FORMATION_SUPERIEURE',
    description: 'Directeur / Directrice pédagogique — formation supérieure',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: ['FORMATION_SUPERIEURE'],
  },
  {
    name: 'ADMIN_PRESCOLAIRE',
    description: 'Alias Directeur pédagogique préscolaire',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: ['PRESCOLAIRE'],
  },
  {
    name: 'ADMIN_FONDAMENTAL',
    description: 'Alias Directeur pédagogique du primaire (1er et 2e cycles)',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: [...LEVELS_PEDAGOGIQUE_PRIMAIRE],
  },
  {
    name: 'ADMIN_SECONDAIRE',
    description: 'Alias Directeur pédagogique du secondaire (3e cycle et secondaire)',
    permissions: PERMS_PEDAGOGIQUE,
    education_levels: [...LEVELS_PEDAGOGIQUE_SECONDAIRE],
  },
  {
    name: 'CENSEUR',
    description: 'Censeur(e) — horaires, examens, notes (toute l’école par défaut)',
    permissions: ['grades', 'schedule', 'stats-academiques', 'fiche-eleve'],
  },
  {
    name: 'SECRETAIRE_GENERAL',
    description: 'Secrétaire général(e) — dossiers élèves, classes (toute l’école)',
    permissions: PERMS_SECRETAIRE,
  },
  {
    name: 'SECRETAIRE_FORMATION_SUPERIEURE',
    description: 'Secrétaire — formation supérieure',
    permissions: PERMS_SECRETAIRE,
    education_levels: ['FORMATION_SUPERIEURE'],
  },
  {
    name: 'SURVEILLANT_GENERAL',
    description: 'Surveillant / Surveillante général(e) — discipline',
    permissions: PERMS_SURVEILLANT,
  },
  {
    name: 'DISCIPLINE',
    description: 'Alias Surveillant général (rétrocompatibilité)',
    permissions: PERMS_SURVEILLANT,
  },
  {
    name: 'ECONOME',
    description: 'Économe — paiements (pas montants ni bourses)',
    permissions: ['finance', 'economat'],
  },
  {
    name: 'COMPTABLE',
    description: 'Comptable — Stats financières (Moniteur, Banques, plan comptable)',
    permissions: ['stats-financieres', 'comptabilite'],
  },
  { name: 'STAFF', description: 'Staff administratif générique (rétrocompatibilité)' },
  { name: 'TEACHER', description: 'Enseignant — notes, appel (présco / 1er-2e AF), devoirs et leçons' },
  { name: 'PARENT', description: 'Parent — fiche de ses enfants' },
  {
    name: 'PHOTOGRAPHER',
    description: 'Photographe — photos élèves',
    permissions: ['photography'],
  },
];

/** Ancien découpage (un rôle par cycle) — à réécrire vers primaire / secondaire. */
const LEGACY_ROLE_EDUCATION_LEVELS: Record<string, string[]> = {
  DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_2: ['FONDAMENTAL_2'],
  DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_3: ['FONDAMENTAL_3'],
  DIRECTEUR_PEDAGOGIQUE_SECONDAIRE: ['SECONDAIRE'],
  ADMIN_SECONDAIRE: ['SECONDAIRE'],
};

const LEGACY_ROLE_DESCRIPTIONS = new Set([
  'Directeur / Directrice pédagogique — 1er et 2e cycles fondamental',
  'Directeur / Directrice pédagogique — 2e cycle fondamental seulement',
  'Directeur / Directrice pédagogique — 3e cycle fondamental',
  'Directeur / Directrice pédagogique — secondaire',
  'Alias Directeur pédagogique 1er et 2e cycles fondamental',
  'Alias Directeur pédagogique secondaire',
]);

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) {}

  async seedDefaults(): Promise<void> {
    for (const r of DEFAULT_ROLES) {
      const levels =
        r.education_levels !== undefined
          ? r.education_levels
          : (DEFAULT_ROLE_EDUCATION_LEVELS[r.name] ?? null);
      const exists = await this.rolesRepo.findOne({ where: { name: r.name } });
      // Rôle renommé par l'école (TEACHER → PROFESSEUR) : ne pas en recréer un
      // second au redémarrage, sinon l'annuaire se scinde en deux.
      if (!exists && isTeacherRoleName(r.name)) {
        const alias = await this.rolesRepo.findOne({
          where: { name: In(TEACHER_ROLE_NAMES) },
        });
        if (alias) continue;
      }
      if (!exists) {
        await this.rolesRepo.save(
          this.rolesRepo.create({
            name: r.name,
            description: r.description,
            permissions: r.permissions ?? null,
            education_levels: levels ?? null,
          }),
        );
        continue;
      }
      let changed = false;
      if (
        (exists.permissions == null || exists.permissions.length === 0) &&
        r.permissions?.length
      ) {
        exists.permissions = r.permissions;
        changed = true;
      }
      if (exists.education_levels == null && levels) {
        exists.education_levels = levels;
        changed = true;
      } else if (
        levels &&
        LEGACY_ROLE_EDUCATION_LEVELS[r.name] &&
        educationLevelsEqual(
          exists.education_levels,
          LEGACY_ROLE_EDUCATION_LEVELS[r.name],
        )
      ) {
        exists.education_levels = levels;
        changed = true;
      }
      if (
        r.description &&
        exists.description !== r.description &&
        (!exists.description || LEGACY_ROLE_DESCRIPTIONS.has(exists.description))
      ) {
        exists.description = r.description;
        changed = true;
      }
      if (changed) await this.rolesRepo.save(exists);
    }
  }

  async findAll(): Promise<Role[]> {
    return this.rolesRepo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<Role> {
    const role = await this.rolesRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async findByName(name: string): Promise<Role | null> {
    return this.rolesRepo.findOne({ where: { name: name.toUpperCase().trim() } });
  }

  async create(params: {
    name: string;
    description?: string;
    permissions?: string[];
    education_levels?: string[] | null;
  }): Promise<Role> {
    const name = params.name.toUpperCase().trim();
    const exists = await this.rolesRepo.findOne({ where: { name } });
    if (exists) throw new BadRequestException('Role name already exists');
    const role = this.rolesRepo.create({
      name,
      description: params.description?.trim(),
      permissions: params.permissions && params.permissions.length > 0 ? params.permissions : null,
      education_levels: normalizeEducationLevels(params.education_levels),
    });
    return this.rolesRepo.save(role);
  }

  async update(
    id: number,
    params: {
      name?: string;
      description?: string;
      permissions?: string[];
      education_levels?: string[] | null;
    },
  ): Promise<Role> {
    const role = await this.findOne(id);
    if (params.name !== undefined) {
      const name = params.name.toUpperCase().trim();
      const exists = await this.rolesRepo.findOne({ where: { name } });
      if (exists && exists.id !== id) throw new BadRequestException('Role name already exists');
      role.name = name;
    }
    if (params.description !== undefined) {
      role.description = params.description.trim() || undefined;
    }
    if (params.permissions !== undefined) {
      role.permissions = params.permissions && params.permissions.length > 0 ? params.permissions : null;
    }
    if (params.education_levels !== undefined) {
      role.education_levels = normalizeEducationLevels(params.education_levels);
    }
    return this.rolesRepo.save(role);
  }

  async delete(id: number): Promise<{ deleted: boolean }> {
    const role = await this.rolesRepo.findOne({ where: { id }, relations: ['users'] });
    if (!role) throw new NotFoundException('Role not found');
    if (role.users?.length > 0) {
      throw new BadRequestException(`Cannot delete role: ${role.users.length} user(s) have this role. Reassign them first.`);
    }
    await this.rolesRepo.remove(role);
    return { deleted: true };
  }
}
