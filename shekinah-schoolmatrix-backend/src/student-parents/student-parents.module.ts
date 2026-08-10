import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentParent } from './student-parent.entity';
import { User } from '../users/user.entity';
import { StudentParentsService } from './student-parents.service';
import { StudentParentsController } from './student-parents.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StudentParent, User])],
  controllers: [StudentParentsController],
  providers: [StudentParentsService],
  exports: [StudentParentsService],
})
export class StudentParentsModule {}
