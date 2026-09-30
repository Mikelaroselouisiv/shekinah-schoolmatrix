import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSchedule } from './exam-schedule.entity';
import { ExamScheduleService } from './exam-schedule.service';
import { ExamScheduleController } from './exam-schedule.controller';
import { Period } from '../period/period.entity';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [TypeOrmModule.forFeature([ExamSchedule, Period]), ParentScopeModule],
  controllers: [ExamScheduleController],
  providers: [ExamScheduleService],
  exports: [ExamScheduleService],
})
export class ExamScheduleModule {}
