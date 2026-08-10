/**
 * Seeds système idempotents.
 * - Rôles par défaut
 * - School profile par défaut
 * Ne crée que si absent, ne supprime jamais de données métier.
 * Le premier admin est créé via /setup/initial-admin (interface).
 */
import { Injectable } from '@nestjs/common';
import { RolesService } from '../roles/roles.service';
import { SchoolProfileService } from '../school-profile/school-profile.service';

@Injectable()
export class SystemSeedService {
  constructor(
    private readonly rolesService: RolesService,
    private readonly schoolProfileService: SchoolProfileService,
  ) {}

  async run(): Promise<void> {
    await this.rolesService.seedDefaults();
    await this.schoolProfileService.ensureProfile();
  }
}
