import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassTeacher } from './class-teacher.entity';
import { TeacherSubject } from './teacher-subject.entity';
import { TeacherClassSubject } from './teacher-class-subject.entity';
import { ScheduleSlot } from './schedule-slot.entity';
import { ClassDayMoment } from './class-day-moment.entity';
import { SchoolWeekDuty } from './school-week-duty.entity';
import { SchoolOpeningInstruction } from './school-opening-instruction.entity';
import { ClassBringItem } from './class-bring-item.entity';
import { BringItemCatalog } from './bring-item-catalog.entity';
import { ClassDaySubject } from './class-day-subject.entity';
import { SchoolMaterial } from './school-material.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/role.entity';
import { Subject } from '../subjects/subject.entity';
import { Class } from '../classes/class.entity';
import { Room } from '../rooms/room.entity';
import { Student } from '../students/student.entity';
import { TeachersService } from './teachers.service';
import { ScheduleMomentsService } from './schedule-moments.service';
import { SchoolMaterialsService } from './school-materials.service';
import { TeachersController } from './teachers.controller';
import { ScheduleSlotsController } from './schedule-slots.controller';
import { StudentScheduleController } from './student-schedule.controller';
import { ScheduleMomentsController } from './schedule-moments.controller';
import { SchoolWeekDutiesController } from './school-week-duties.controller';
import { ClassBringItemsController } from './class-bring-items.controller';
import { BringItemCatalogController } from './bring-item-catalog.controller';
import { SchoolMaterialsController } from './school-materials.controller';
import { ParentScopeModule } from '../auth/parent-scope.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ParentScopeModule,
    UsersModule,
    TypeOrmModule.forFeature([
      ClassTeacher,
      TeacherSubject,
      TeacherClassSubject,
      ScheduleSlot,
      ClassDayMoment,
      SchoolWeekDuty,
      SchoolOpeningInstruction,
      ClassBringItem,
      BringItemCatalog,
      ClassDaySubject,
      SchoolMaterial,
      User,
      Role,
      Subject,
      Class,
      Room,
      Student,
    ]),
  ],
  controllers: [
    TeachersController,
    ScheduleSlotsController,
    StudentScheduleController,
    ScheduleMomentsController,
    SchoolWeekDutiesController,
    ClassBringItemsController,
    BringItemCatalogController,
    SchoolMaterialsController,
  ],
  providers: [TeachersService, ScheduleMomentsService, SchoolMaterialsService],
  exports: [TeachersService, ScheduleMomentsService, SchoolMaterialsService],
})
export class TeachersModule {}
