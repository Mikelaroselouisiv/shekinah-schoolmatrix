import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class } from './class.entity';
import { ClassSubject } from './class-subject.entity';
import { Room } from '../rooms/room.entity';
import { Subject } from '../subjects/subject.entity';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Class, ClassSubject, Room, Subject]),
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
