import { Module } from '@nestjs/common';
import { SystemSeedService } from './system-seed.service';
import { RolesModule } from '../roles/roles.module';
import { SchoolProfileModule } from '../school-profile/school-profile.module';

@Module({
  imports: [RolesModule, SchoolProfileModule],
  providers: [SystemSeedService],
  exports: [SystemSeedService],
})
export class SystemSeedModule {}
