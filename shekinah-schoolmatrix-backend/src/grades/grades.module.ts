import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassSubjectCoefficient } from './class-subject-coefficient.entity';
import { Grade } from './grade.entity';
import { PreschoolGrade } from './preschool-grade.entity';
import { Student } from '../students/student.entity';
import { ScheduleSlot } from '../teachers/schedule-slot.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';
import { Subject } from '../subjects/subject.entity';
import { Period } from '../period/period.entity';
import { GradesService } from './grades.service';
import { PreschoolGradesService } from './preschool-grades.service';
import { GradesController } from './grades.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassSubjectCoefficient,
      Grade,
      PreschoolGrade,
      Student,
      ScheduleSlot,
      AcademicYear,
      Class,
      Subject,
      Period,
    ]),
  ],
  controllers: [GradesController],
  providers: [GradesService, PreschoolGradesService],
  exports: [GradesService, PreschoolGradesService],
})
export class GradesModule {}
