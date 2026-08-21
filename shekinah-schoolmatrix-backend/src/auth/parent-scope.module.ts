import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { UserLinkedStudent } from '../users/user-linked-student.entity';
import { ParentScopeGuard } from './parent-scope.guard';

/** Fournit ParentScopeGuard aux modules métier qui exposent des données élève. */
@Module({
  imports: [TypeOrmModule.forFeature([User, UserLinkedStudent])],
  providers: [ParentScopeGuard],
  exports: [ParentScopeGuard, TypeOrmModule],
})
export class ParentScopeModule {}
