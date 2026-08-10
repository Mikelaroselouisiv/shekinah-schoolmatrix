import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';

const DEFAULT_ROLES: {
  name: string;
  description: string;
  permissions?: string[];
}[] = [
  { name: 'SUPER_ADMIN', description: 'Technicien / maintenance — accès total (première personne enregistrée et techniciens)' },
  { name: 'DIRECTEUR_GENERAL', description: 'Directeur général — propriétaire de l\'école, peut tout faire' },
  { name: 'SCHOOL_ADMIN', description: 'Alias direction (rétrocompatibilité)' },
  { name: 'DIRECTEUR_PEDAGOGIQUE', description: 'Directeur pédagogique — vie étudiante et études' },
  { name: 'CENSEUR', description: 'Censeur(e) — horaires, examens, saisie des notes' },
  { name: 'ADMIN_PRESCOLAIRE', description: 'Administrateur préscolaire — démarches admin, examens, parascolaire' },
  { name: 'ADMIN_FONDAMENTAL', description: 'Administrateur fondamental — démarches admin, examens, parascolaire' },
  { name: 'ADMIN_SECONDAIRE', description: 'Administrateur secondaire — démarches admin, examens, parascolaire' },
  { name: 'ECONOME', description: 'Économe — enregistre les paiements uniquement (pas montants ni bourses)' },
  {
    name: 'COMPTABLE',
    description: 'Comptable — Stats financières (Moniteur, Banques, plan comptable, journaux, exercices)',
    permissions: ['stats-financieres', 'comptabilite'],
  },
  { name: 'DISCIPLINE', description: 'Responsable discipline (présence, retards, pointage)' },
  { name: 'STAFF', description: 'Staff administratif générique (rétrocompatibilité)' },
  { name: 'TEACHER', description: 'Professeur' },
  { name: 'PARENT', description: 'Parent — rôle par défaut à la création de compte' },
  {
    name: 'PHOTOGRAPHER',
    description: 'Photographe — accès à l’onglet Photographie (ajout de photos élèves uniquement)',
    permissions: ['photography'],
  },
];

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) {}

  async seedDefaults(): Promise<void> {
    for (const r of DEFAULT_ROLES) {
      const exists = await this.rolesRepo.findOne({ where: { name: r.name } });
      if (!exists) {
        await this.rolesRepo.save(
          this.rolesRepo.create({
            name: r.name,
            description: r.description,
            permissions: r.permissions ?? null,
          }),
        );
      }
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

  async create(params: { name: string; description?: string; permissions?: string[] }): Promise<Role> {
    const name = params.name.toUpperCase().trim();
    const exists = await this.rolesRepo.findOne({ where: { name } });
    if (exists) throw new BadRequestException('Role name already exists');
    const role = this.rolesRepo.create({
      name,
      description: params.description?.trim(),
      permissions: params.permissions && params.permissions.length > 0 ? params.permissions : null,
    });
    return this.rolesRepo.save(role);
  }

  async update(id: number, params: { name?: string; description?: string; permissions?: string[] }): Promise<Role> {
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
