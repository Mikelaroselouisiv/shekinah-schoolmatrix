import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grade } from '../grades/grade.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Period } from '../period/period.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { TeacherClassSubject } from '../teachers/teacher-class-subject.entity';
import { ClassTeacher } from '../teachers/class-teacher.entity';
import { Attendance } from '../discipline/attendance.entity';
import { Lateness } from '../discipline/lateness.entity';
import { DisciplinaryDeduction } from '../discipline/disciplinary-deduction.entity';
import { ClassDecisionThreshold } from '../formation-classe/class-decision-threshold.entity';
import { ClassSubjectCoefficient } from '../grades/class-subject-coefficient.entity';
import { FeeService } from '../economat/fee-service.entity';
import { ClassFee } from '../economat/class-fee.entity';
import { PaymentTransaction } from '../economat/payment-transaction.entity';
import { StudentServiceExemption } from '../economat/student-service-exemption.entity';
import { FinanceModule } from '../finance/finance.module';
import { AuthModule } from '../auth/auth.module';
import { ParentScopeModule } from '../auth/parent-scope.module';
import { LevelScopeModule } from '../auth/level-scope.module';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Grade,
      Student,
      Class,
      AcademicYear,
      Period,
      User,
      Role,
      TeacherClassSubject,
      ClassTeacher,
      Attendance,
      Lateness,
      DisciplinaryDeduction,
      ClassDecisionThreshold,
      ClassSubjectCoefficient,
      FeeService,
      ClassFee,
      PaymentTransaction,
      StudentServiceExemption,
    ]),
    FinanceModule,
    AuthModule,
    ParentScopeModule,
    LevelScopeModule,
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
