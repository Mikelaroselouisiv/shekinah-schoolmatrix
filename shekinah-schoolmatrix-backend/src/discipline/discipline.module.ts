import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './attendance.entity';
import { Lateness } from './lateness.entity';
import { DisciplinaryDeduction } from './disciplinary-deduction.entity';
import { DisciplinaryMeasure } from './disciplinary-measure.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { DisciplineService } from './discipline.service';
import { DisciplineController } from './discipline.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Attendance,
      Lateness,
      DisciplinaryDeduction,
      DisciplinaryMeasure,
      Student,
      Class,
    ]),
  ],
  controllers: [DisciplineController],
  providers: [DisciplineService],
  exports: [DisciplineService],
})
export class DisciplineModule {}
