import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentPhoto, StudentPhotoKind } from './student-photo.entity';
import { Student } from './student.entity';

const ALLOWED_KINDS: StudentPhotoKind[] = [
  'profile',
  'identity',
  'souvenir',
  'promotion',
  'other',
];

@Injectable()
export class StudentPhotosService {
  constructor(
    @InjectRepository(StudentPhoto)
    private readonly photoRepo: Repository<StudentPhoto>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  async listForStudent(studentId: string): Promise<StudentPhoto[]> {
    await this.assertStudent(studentId);
    return this.photoRepo.find({
      where: { student_id: studentId },
      order: { created_at: 'DESC' },
    });
  }

  async add(params: {
    student_id: string;
    kind: string;
    url: string;
    label?: string | null;
  }): Promise<StudentPhoto> {
    await this.assertStudent(params.student_id);
    const kind = params.kind as StudentPhotoKind;
    if (!ALLOWED_KINDS.includes(kind)) {
      throw new BadRequestException(
        `Type de photo invalide. Autorisés : ${ALLOWED_KINDS.join(', ')}`,
      );
    }
    const url = (params.url ?? '').trim();
    if (!url) throw new BadRequestException('URL de photo requise.');

    const photo = this.photoRepo.create({
      student_id: params.student_id,
      kind,
      url,
      label: params.label?.trim() || null,
    });
    const saved = await this.photoRepo.save(photo);

    if (kind === 'profile' || kind === 'identity') {
      await this.studentRepo.update(params.student_id, {
        photo_identity_student: url,
      });
    }
    return saved;
  }

  async remove(studentId: string, photoId: string): Promise<void> {
    const photo = await this.photoRepo.findOne({
      where: { id: photoId, student_id: studentId },
    });
    if (!photo) throw new NotFoundException('Photo introuvable');
    await this.photoRepo.remove(photo);
  }

  private async assertStudent(id: string): Promise<Student> {
    const s = await this.studentRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Élève introuvable');
    return s;
  }
}
