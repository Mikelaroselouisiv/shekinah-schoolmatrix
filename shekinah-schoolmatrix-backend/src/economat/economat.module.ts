import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeService } from './fee-service.entity';
import { ClassFee } from './class-fee.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { StudentServiceExemption } from './student-service-exemption.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { EconomatService } from './economat.service';
import { EconomatController } from './economat.controller';
import { FinanceModule } from '../finance/finance.module';
import { AuthModule } from '../auth/auth.module';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [
    FinanceModule,
    AuthModule,
    ParentScopeModule,
    TypeOrmModule.forFeature([
      FeeService,
      ClassFee,
      PaymentTransaction,
      StudentServiceExemption,
      Student,
      Class,
    ]),
  ],
  controllers: [EconomatController],
  providers: [EconomatService],
  exports: [EconomatService],
})
export class EconomatModule {}
