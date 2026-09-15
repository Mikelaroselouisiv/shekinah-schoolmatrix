import { Module } from '@nestjs/common';
import { StudentParentsService } from './student-parents.service';
import { StudentParentsController } from './student-parents.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [StudentParentsController],
  providers: [StudentParentsService],
  exports: [StudentParentsService],
})
export class StudentParentsModule {}
