import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadsService } from './uploads.service';

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async upload(
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ) {
    const buffer = file?.buffer;
    if (!file || !buffer) {
      throw new BadRequestException('Aucun fichier envoyé');
    }
    const mimetype = file.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_MIMES.includes(mimetype)) {
      throw new BadRequestException(
        'Type de fichier non autorisé. Utilisez JPEG, PNG, GIF, WebP ou SVG.',
      );
    }
    const url = await this.uploadsService.saveFile(
      buffer,
      mimetype,
      file.originalname ?? 'image',
    );
    return { ok: true, url };
  }
}
