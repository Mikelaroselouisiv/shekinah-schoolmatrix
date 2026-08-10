import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('schedule-slots')
@UseGuards(JwtAuthGuard)
export class ScheduleSlotsController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get()
  async list(
    @Query('class_id') classId?: string,
    @Query('room_id') roomId?: string,
    @Query('teacher_id') teacherId?: string,
    @Query('day_of_week') dayOfWeek?: string,
    @Query('academic_year') academicYear?: string,
  ) {
    const slots = await this.teachersService.getScheduleSlots({
      class_id: classId,
      room_id: roomId,
      teacher_id: teacherId ? parseInt(teacherId, 10) : undefined,
      day_of_week: dayOfWeek ? parseInt(dayOfWeek, 10) : undefined,
      academic_year: academicYear,
    });
    return { ok: true, schedule_slots: slots };
  }

  @Post()
  async create(
    @Body()
    body: {
      academic_year?: string;
      class_id: string;
      subject_id: string;
      teacher_id: number;
      room_id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
    },
  ) {
    const slot = await this.teachersService.createScheduleSlot({
      academic_year: body.academic_year,
      class_id: body.class_id,
      subject_id: body.subject_id,
      teacher_id: body.teacher_id,
      room_id: body.room_id,
      day_of_week: body.day_of_week,
      start_time: body.start_time,
      end_time: body.end_time,
    });
    return {
      ok: true,
      schedule_slot: {
        id: slot.id,
        academic_year: slot.academic_year ?? null,
        class_id: slot.class?.id ?? (slot as any).class_id,
        subject_id: slot.subject?.id ?? (slot as any).subject_id,
        teacher_id: slot.teacher?.id ?? (slot as any).teacher_id,
        room_id: slot.room?.id ?? (slot as any).room_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        created_at: slot.created_at,
      },
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      academic_year: string;
      class_id: string;
      subject_id: string;
      teacher_id: number;
      room_id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>,
  ) {
    const slot = await this.teachersService.updateScheduleSlot(id, body);
    return {
      ok: true,
      schedule_slot: {
        id: slot.id,
        academic_year: slot.academic_year ?? null,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        updated_at: slot.updated_at,
      },
    };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.teachersService.deleteScheduleSlot(id);
    return { ok: true, deleted: true };
  }
}
