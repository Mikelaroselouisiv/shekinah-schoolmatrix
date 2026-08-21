import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolProfile } from './school-profile.entity';
import { SchoolSignature } from './school-signature.entity';
import { SchoolProfileService } from './school-profile.service';
import { SchoolProfileController } from './school-profile.controller';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Period } from '../period/period.entity';
import { Class } from '../classes/class.entity';
import { Student } from '../students/student.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { AuthModule } from '../auth/auth.module';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchoolProfile,
      SchoolSignature,
      AcademicYear,
      Period,
      Class,
      Student,
      User,
      Role,
    ]),
    AuthModule,
    ParentScopeModule,
  ],
  controllers: [SchoolProfileController],
  providers: [SchoolProfileService],
  exports: [SchoolProfileService],
})
export class SchoolProfileModule {}
