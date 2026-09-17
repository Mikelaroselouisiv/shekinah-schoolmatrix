import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolVacation } from './school-vacation.entity';
import { SchoolVacationService } from './school-vacation.service';
import { SchoolVacationController } from './school-vacation.controller';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [TypeOrmModule.forFeature([SchoolVacation]), ParentScopeModule],
  controllers: [SchoolVacationController],
  providers: [SchoolVacationService],
  exports: [SchoolVacationService],
})
export class SchoolVacationModule {}
