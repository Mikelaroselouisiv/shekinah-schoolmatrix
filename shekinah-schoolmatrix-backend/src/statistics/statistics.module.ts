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
import { Attendance } from '../discipline/attendance.entity';
import { Lateness } from '../discipline/lateness.entity';
import { DisciplinaryDeduction } from '../discipline/disciplinary-deduction.entity';
import { FeeService } from '../economat/fee-service.entity';
import { ClassFee } from '../economat/class-fee.entity';
import { PaymentTransaction } from '../economat/payment-transaction.entity';
import { StudentServiceExemption } from '../economat/student-service-exemption.entity';
import { FinanceModule } from '../finance/finance.module';
import { AuthModule } from '../auth/auth.module';
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
      Attendance,
      Lateness,
      DisciplinaryDeduction,
      FeeService,
      ClassFee,
      PaymentTransaction,
      StudentServiceExemption,
    ]),
    FinanceModule,
    AuthModule,
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
