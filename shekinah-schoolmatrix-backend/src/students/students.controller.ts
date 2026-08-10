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
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isPreschoolClass } from '../utils/preschool';

@Controller('students')
@UseGuards(JwtAuthGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  async list(
    @Query('class_id') classId?: string,
    @Query('room_id') roomId?: string,
  ) {
    const students = await this.studentsService.findAll({
      classId: classId || undefined,
      roomId: roomId || undefined,
    });
    return {
      ok: true,
      students: students.map((s) => ({
        id: s.id,
        order_number: s.order_number,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        phone: s.phone,
        address: s.address,
        birth_date: s.birth_date,
        birth_place: s.birth_place,
        gender: s.gender,
        photo_identity_student: s.photo_identity_student,
        photo_identity_mother: s.photo_identity_mother,
        photo_identity_father: s.photo_identity_father,
        photo_identity_responsible: s.photo_identity_responsible,
        mother_name: s.mother_name,
        mother_phone: s.mother_phone,
        father_name: s.father_name,
        father_phone: s.father_phone,
        responsible_name: s.responsible_name,
        responsible_phone: s.responsible_phone,
        class_id: s.class?.id,
        class_name: s.class?.name,
        room_id: s.room?.id ?? null,
        room_name: s.room?.name ?? null,
        active: s.active,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })),
    };
  }

  @Get('by-order-number/:orderNumber')
  async byOrderNumber(@Param('orderNumber') orderNumber: string) {
    const s = await this.studentsService.findByOrderNumber(decodeURIComponent(orderNumber));
    if (!s) {
      return { ok: false, student: null };
    }
    return {
      ok: true,
      student: {
        id: s.id,
        order_number: s.order_number,
        first_name: s.first_name,
        last_name: s.last_name,
        class_id: s.class?.id,
        class_name: s.class?.name,
      },
    };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const s = await this.studentsService.findOne(id);
    const c = s.class;
    const isPreschool = isPreschoolClass(c?.description, c?.level);
    return {
      ok: true,
      student: {
        id: s.id,
        order_number: s.order_number,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        phone: s.phone,
        address: s.address,
        birth_date: s.birth_date,
        birth_place: s.birth_place,
        gender: s.gender,
        photo_identity_student: s.photo_identity_student,
        photo_identity_mother: s.photo_identity_mother,
        photo_identity_father: s.photo_identity_father,
        photo_identity_responsible: s.photo_identity_responsible,
        mother_name: s.mother_name,
        mother_phone: s.mother_phone,
        father_name: s.father_name,
        father_phone: s.father_phone,
        responsible_name: s.responsible_name,
        responsible_phone: s.responsible_phone,
        class_id: s.class?.id,
        class_name: s.class?.name,
        room_id: s.room?.id ?? null,
        room_name: s.room?.name ?? null,
        is_preschool: isPreschool,
        active: s.active,
        created_at: s.created_at,
        updated_at: s.updated_at,
      },
    };
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async importCsv(
    @UploadedFile() file: { buffer?: Buffer; path?: string },
    @Body('academic_year_id') academicYearId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier CSV requis.');
    }
    if (!academicYearId?.trim()) {
      throw new BadRequestException('Année académique requise.');
    }
    let csvContent: string;
    if (file.buffer) {
      csvContent = file.buffer.toString('utf-8');
    } else if (file.path) {
      const fs = require('fs');
      csvContent = fs.readFileSync(file.path, 'utf-8');
    } else {
      throw new BadRequestException('Fichier CSV invalide.');
    }
    const result = await this.studentsService.importFromCsv(csvContent, academicYearId.trim());
    return { ok: true, ...result };
  }

  /** Aperçu PDF (heuristique + IA) — n’écrit pas en base. */
  @Post('import-pdf/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async importPdfPreview(@UploadedFile() file: { buffer?: Buffer }) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Fichier PDF requis.');
    }
    const preview = await this.studentsService.previewPdfImport(file.buffer);
    return {
      ok: true,
      rows: preview.rows,
      header_found: preview.header_found,
      warnings: preview.warnings,
      method: preview.method,
      ai_configured: preview.ai_configured,
      count: preview.rows.length,
    };
  }

  /** Confirme l’inscription PDF dans la classe choisie (sans salle). */
  @Post('import-pdf')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async importPdf(
    @UploadedFile() file: { buffer?: Buffer },
    @Body('class_id') classId: string,
    @Body('academic_year_id') academicYearId?: string,
    @Body('rows_json') rowsJson?: string,
  ) {
    if (!classId?.trim()) {
      throw new BadRequestException('Classe requise.');
    }
    let confirmedRows: any[] | undefined;
    if (rowsJson?.trim()) {
      try {
        confirmedRows = JSON.parse(rowsJson);
      } catch {
        throw new BadRequestException('rows_json invalide.');
      }
    }
    if (!confirmedRows?.length && !file?.buffer?.length) {
      throw new BadRequestException('Fichier PDF ou lignes confirmées requis.');
    }
    const result = await this.studentsService.importFromPdf(
      file?.buffer ?? Buffer.alloc(0),
      classId.trim(),
      academicYearId?.trim() || null,
      confirmedRows,
    );
    return { ok: true, ...result };
  }

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const s = await this.studentsService.create(body as any);
    return {
      ok: true,
      student: {
        id: s.id,
        order_number: s.order_number,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        phone: s.phone,
        address: s.address,
        birth_date: s.birth_date,
        birth_place: s.birth_place,
        gender: s.gender,
        photo_identity_student: s.photo_identity_student,
        photo_identity_mother: s.photo_identity_mother,
        photo_identity_father: s.photo_identity_father,
        photo_identity_responsible: s.photo_identity_responsible,
        mother_name: s.mother_name,
        mother_phone: s.mother_phone,
        father_name: s.father_name,
        father_phone: s.father_phone,
        responsible_name: s.responsible_name,
        responsible_phone: s.responsible_phone,
        class_id: s.class?.id,
        room_id: s.room?.id ?? null,
        room_name: s.room?.name ?? null,
        active: s.active,
        created_at: s.created_at,
        updated_at: s.updated_at,
      },
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const s = await this.studentsService.update(id, body as any);
    return {
      ok: true,
      student: {
        id: s.id,
        order_number: s.order_number,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        phone: s.phone,
        address: s.address,
        birth_date: s.birth_date,
        birth_place: s.birth_place,
        gender: s.gender,
        photo_identity_student: s.photo_identity_student,
        photo_identity_mother: s.photo_identity_mother,
        photo_identity_father: s.photo_identity_father,
        photo_identity_responsible: s.photo_identity_responsible,
        mother_name: s.mother_name,
        mother_phone: s.mother_phone,
        father_name: s.father_name,
        father_phone: s.father_phone,
        responsible_name: s.responsible_name,
        responsible_phone: s.responsible_phone,
        class_id: s.class?.id,
        room_id: s.room?.id ?? null,
        room_name: s.room?.name ?? null,
        active: s.active,
        created_at: s.created_at,
        updated_at: s.updated_at,
      },
    };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.studentsService.delete(id);
    return { ok: true, deleted: true };
  }
}
