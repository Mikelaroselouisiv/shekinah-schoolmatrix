import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentMeeting } from './parent-meeting.entity';
import { ParentMeetingService } from './parent-meeting.service';
import { ParentMeetingController } from './parent-meeting.controller';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [TypeOrmModule.forFeature([ParentMeeting]), ParentScopeModule],
  controllers: [ParentMeetingController],
  providers: [ParentMeetingService],
  exports: [ParentMeetingService],
})
export class ParentMeetingModule {}
