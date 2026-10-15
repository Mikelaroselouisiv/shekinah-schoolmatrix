import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamPeriod } from './exam-period.entity';
import { ExamPeriodService } from './exam-period.service';
import { ExamPeriodController } from './exam-period.controller';
import { Period } from '../period/period.entity';
import { Class } from '../classes/class.entity';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [TypeOrmModule.forFeature([ExamPeriod, Period, Class]), ParentScopeModule],
  controllers: [ExamPeriodController],
  providers: [ExamPeriodService],
  exports: [ExamPeriodService],
})
export class ExamPeriodModule {}
