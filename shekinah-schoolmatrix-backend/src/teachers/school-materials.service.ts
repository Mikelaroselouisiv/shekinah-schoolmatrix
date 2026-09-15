import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from '../subjects/subject.entity';
import {
  SCHOOL_MATERIAL_KINDS,
  SchoolMaterial,
  SchoolMaterialKind,
} from './school-material.entity';

export type SchoolMaterialDto = {
  id: string;
  kind: SchoolMaterialKind;
  name: string;
  label: string;
  subject_id: string | null;
  subject_name: string | null;
};

function parseKind(raw?: string): SchoolMaterialKind {
  const k = String(raw ?? '').trim().toUpperCase();
  if (!(SCHOOL_MATERIAL_KINDS as readonly string[]).includes(k)) {
    throw new BadRequestException('Type invalide (LIVRE, CAHIER)');
  }
  return k as SchoolMaterialKind;
}

function kindWord(kind: SchoolMaterialKind): string {
  return kind === 'LIVRE' ? 'Livre' : 'Cahier';
}

@Injectable()
export class SchoolMaterialsService {
  constructor(
    @InjectRepository(SchoolMaterial)
    private readonly repo: Repository<SchoolMaterial>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
  ) {}

  toDto(row: SchoolMaterial): SchoolMaterialDto {
    const subjectName = row.subject?.name ?? null;
    const name = row.name.trim();
    return {
      id: row.id,
      kind: row.kind,
      name,
      label: `${kindWord(row.kind)} · ${name}`,
      subject_id: row.subject?.id ?? row.subject_id ?? null,
      subject_name: subjectName,
    };
  }

  async list(): Promise<SchoolMaterialDto[]> {
    const rows = await this.repo.find({
      relations: ['subject'],
      order: { kind: 'ASC', name: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(body: {
    kind: string;
    name: string;
    subject_id?: string | null;
  }): Promise<SchoolMaterialDto> {
    const kind = parseKind(body.kind);
    const name = String(body.name ?? '').trim();
    if (!name) throw new BadRequestException('Nom requis');
    let subject: Subject | null = null;
    const sid = body.subject_id?.trim();
    if (sid) {
      subject = await this.subjectRepo.findOne({ where: { id: sid } });
      if (!subject) throw new BadRequestException('Matière introuvable');
    }
    try {
      const saved = await this.repo.save(
        this.repo.create({
          kind,
          name,
          subject_id: subject?.id ?? null,
          subject,
        }),
      );
      return this.toDto({ ...saved, subject });
    } catch {
      throw new BadRequestException('Ce matériel existe déjà');
    }
  }

  async remove(id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Matériel introuvable');
    await this.repo.remove(row);
  }
}
