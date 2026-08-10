import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StudentPhotosService } from './student-photos.service';

@Controller('students/:studentId/photos')
@UseGuards(JwtAuthGuard)
export class StudentPhotosController {
  constructor(private readonly photosService: StudentPhotosService) {}

  @Get()
  async list(@Param('studentId') studentId: string) {
    const photos = await this.photosService.listForStudent(studentId);
    return {
      ok: true,
      photos: photos.map((p) => ({
        id: p.id,
        kind: p.kind,
        label: p.label,
        url: p.url,
        created_at: p.created_at,
      })),
    };
  }

  @Post()
  async add(
    @Param('studentId') studentId: string,
    @Body() body: { kind: string; url: string; label?: string },
  ) {
    if (!body?.kind || !body?.url) {
      throw new BadRequestException('kind et url requis');
    }
    const photo = await this.photosService.add({
      student_id: studentId,
      kind: body.kind,
      url: body.url,
      label: body.label,
    });
    return {
      ok: true,
      photo: {
        id: photo.id,
        kind: photo.kind,
        label: photo.label,
        url: photo.url,
        created_at: photo.created_at,
      },
    };
  }

  @Delete(':photoId')
  async remove(
    @Param('studentId') studentId: string,
    @Param('photoId') photoId: string,
  ) {
    await this.photosService.remove(studentId, photoId);
    return { ok: true, deleted: true };
  }
}
