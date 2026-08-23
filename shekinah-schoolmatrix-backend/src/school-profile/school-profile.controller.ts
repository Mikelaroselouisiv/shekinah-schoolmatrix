import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SchoolProfileService } from './school-profile.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { ParentScopeGuard } from '../auth/parent-scope.guard';
import { DenyParents } from '../auth/parent-scope.decorator';

@Controller('school')
export class SchoolProfileController {
  constructor(private readonly schoolProfileService: SchoolProfileService) {}

  @Get('home')
  async getForHome() {
    const profile = await this.schoolProfileService.getProfile();
    if (!profile) {
      return { ok: true, school: null };
    }
    return {
      ok: true,
      school: this.schoolProfileService.toSchoolDto(profile),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('current-context')
  async getCurrentContext() {
    const ctx = await this.schoolProfileService.getCurrentContext();
    return { ok: true, ...ctx };
  }

  /** Statistiques sensibles : rôles admin ou permission full_access. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'DIRECTEUR_ADMINISTRATIF', 'ADMINISTRATEUR', 'SCHOOL_ADMIN')
  @Permissions('full_access')
  @Get('dashboard-stats')
  async getDashboardStats() {
    const stats = await this.schoolProfileService.getDashboardStats();
    return { ok: true, ...stats };
  }

  @UseGuards(JwtAuthGuard, ParentScopeGuard)
  @DenyParents()
  @Get('signatures')
  async listSignatures() {
    const signatures = await this.schoolProfileService.listSignatures();
    return { ok: true, signatures };
  }

  @UseGuards(JwtAuthGuard, ParentScopeGuard)
  @DenyParents()
  @Put('signatures')
  async replaceSignatures(
    @Body()
    body: {
      signatures?: Array<{
        id?: string;
        slot_key: string;
        signer_name?: string;
        signer_role?: string;
        image_url?: string | null;
        sort_order?: number;
      }>;
    },
  ) {
    const signatures = await this.schoolProfileService.replaceSignatures(
      body.signatures ?? [],
    );
    return { ok: true, signatures };
  }

  @UseGuards(JwtAuthGuard, ParentScopeGuard)
  @DenyParents()
  @Delete('signatures/:id')
  async deleteSignature(@Param('id') id: string) {
    await this.schoolProfileService.deleteSignature(id);
    return { ok: true, deleted: true };
  }

  @UseGuards(JwtAuthGuard, ParentScopeGuard)
  @DenyParents()
  @Patch('profile')
  async updateProfile(
    @Body()
    body: {
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
      /** Optionnel : enregistre les signatures dans le même appel. */
      signatures?: Array<{
        id?: string;
        slot_key: string;
        signer_name?: string;
        signer_role?: string;
        image_url?: string | null;
        sort_order?: number;
      }>;
    },
  ) {
    const { signatures: sigBody, ...profileBody } = body;
    const profile = await this.schoolProfileService.updateProfile(profileBody);
    const signatures =
      sigBody !== undefined
        ? await this.schoolProfileService.replaceSignatures(sigBody)
        : await this.schoolProfileService.listSignatures();
    return {
      ok: true,
      school: this.schoolProfileService.toSchoolDto(profile),
      signatures,
    };
  }
}
