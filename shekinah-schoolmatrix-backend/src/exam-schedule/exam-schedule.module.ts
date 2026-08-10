import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSchedule } from './exam-schedule.entity';
import { ExamScheduleService } from './exam-schedule.service';
import { ExamScheduleController } from './exam-schedule.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExamSchedule])],
  controllers: [ExamScheduleController],
  providers: [ExamScheduleService],
  exports: [ExamScheduleService],
})
export class ExamScheduleModule {}
