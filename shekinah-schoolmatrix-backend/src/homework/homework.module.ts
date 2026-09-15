import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeworkAssignment } from './homework-assignment.entity';
import { HomeworkGrade } from './homework-grade.entity';
import { Student } from '../students/student.entity';
import { HomeworkService } from './homework.service';
import { HomeworkController } from './homework.controller';
import { TeachersModule } from '../teachers/teachers.module';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HomeworkAssignment, HomeworkGrade, Student]),
    TeachersModule,
    ParentScopeModule,
  ],
  controllers: [HomeworkController],
  providers: [HomeworkService],
  exports: [HomeworkService],
})
export class HomeworkModule {}
