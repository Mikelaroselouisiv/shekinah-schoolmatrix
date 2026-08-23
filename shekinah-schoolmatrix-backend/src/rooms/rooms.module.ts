import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from './room.entity';
import { Class } from '../classes/class.entity';
import { Student } from '../students/student.entity';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { ParentScopeModule } from '../auth/parent-scope.module';
import { LevelScopeModule } from '../auth/level-scope.module';

@Module({
  imports: [TypeOrmModule.forFeature([Room, Class, Student]), ParentScopeModule, LevelScopeModule],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
