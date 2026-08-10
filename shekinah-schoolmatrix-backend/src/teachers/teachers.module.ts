import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassTeacher } from './class-teacher.entity';
import { TeacherSubject } from './teacher-subject.entity';
import { TeacherClassSubject } from './teacher-class-subject.entity';
import { ScheduleSlot } from './schedule-slot.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { Subject } from '../subjects/subject.entity';
import { Class } from '../classes/class.entity';
import { Room } from '../rooms/room.entity';
import { TeachersService } from './teachers.service';
import { TeachersController } from './teachers.controller';
import { ScheduleSlotsController } from './schedule-slots.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassTeacher,
      TeacherSubject,
      TeacherClassSubject,
      ScheduleSlot,
      User,
      Role,
      Subject,
      Class,
      Room,
    ]),
  ],
  controllers: [TeachersController, ScheduleSlotsController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
