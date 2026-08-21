import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserLinkedStudent } from './user-linked-student.entity';
import { Role } from '../roles/role.entity';
import { Student } from '../students/student.entity';
import { StudentParent } from '../student-parents/student-parent.entity';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { UsersService } from './users.service';
import { ParentAccountService } from './parent-account.service';
import { UsersController } from './users.controller';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserLinkedStudent,
      Role,
      Student,
      StudentParent,
      SchoolProfile,
      RefreshToken,
    ]),
    ParentScopeModule,
  ],
  providers: [UsersService, ParentAccountService],
  controllers: [UsersController],
  exports: [UsersService, ParentAccountService],
})
export class UsersModule {}
