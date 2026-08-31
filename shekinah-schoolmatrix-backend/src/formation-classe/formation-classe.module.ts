import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentClassAssignment } from './student-class-assignment.entity';
import { ClassDecisionThreshold } from './class-decision-threshold.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Grade } from '../grades/grade.entity';
import { ClassSubjectCoefficient } from '../grades/class-subject-coefficient.entity';
import { DisciplinaryMeasure } from '../discipline/disciplinary-measure.entity';
import { Period } from '../period/period.entity';
import { ScheduleSlot } from '../teachers/schedule-slot.entity';
import { Room } from '../rooms/room.entity';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { FormationClasseService } from './formation-classe.service';
import { FormationClasseController } from './formation-classe.controller';
import { ParentScopeModule } from '../auth/parent-scope.module';
import { LevelScopeModule } from '../auth/level-scope.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentClassAssignment,
      ClassDecisionThreshold,
      Student,
      Class,
      AcademicYear,
      Grade,
      ClassSubjectCoefficient,
      DisciplinaryMeasure,
      Period,
      ScheduleSlot,
      Room,
      SchoolProfile,
    ]),
    ParentScopeModule,
    LevelScopeModule,
  ],
  controllers: [FormationClasseController],
  providers: [FormationClasseService],
  exports: [FormationClasseService],
})
export class FormationClasseModule {}
