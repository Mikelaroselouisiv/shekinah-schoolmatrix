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
import { FormationClasseService } from './formation-classe.service';
import { FormationClasseController } from './formation-classe.controller';

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
    ]),
  ],
  controllers: [FormationClasseController],
  providers: [FormationClasseService],
  exports: [FormationClasseService],
})
export class FormationClasseModule {}
