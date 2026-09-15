import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from './student.entity';
import { Class } from '../classes/class.entity';
import { Room } from '../rooms/room.entity';
import { FormationClasseService } from '../formation-classe/formation-classe.service';
import { StudentClassAssignment } from '../formation-classe/student-class-assignment.entity';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { ClassesService } from '../classes/classes.service';
import { RoomsService } from '../rooms/rooms.service';
import { StudentAiImportService } from './student-ai-import.service';
import { isPostgresUniqueViolation, normalizeNisu } from './student-nisu';
import { SyncKickService } from '../sync/sync-kick.service';
import { ParentAccountService } from '../users/parent-account.service';
import { isHigherEducationLevel } from '../roles/education-levels';
import type { ArchiveReason } from './student.serialize';

export type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @Inject(forwardRef(() => FormationClasseService))
    private readonly formationClasseService: FormationClasseService,
    private readonly classesService: ClassesService,
    private readonly roomsService: RoomsService,
    private readonly studentAiImport: StudentAiImportService,
    private readonly syncKick: SyncKickService,
    private readonly parentAccounts: ParentAccountService,
    @InjectRepository(StudentClassAssignment)
    private readonly assignmentRepo: Repository<StudentClassAssignment>,
    @InjectRepository(SchoolProfile)
    private readonly schoolProfileRepo: Repository<SchoolProfile>,
  ) {}

  async findAll(filters?: {
    classId?: string;
    roomId?: string;
    status?: 'active' | 'alumni' | 'all';
  }): Promise<Student[]> {
    const qb = this.studentRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.class', 'c')
      .leftJoinAndSelect('s.room', 'r')
      .orderBy('c.name', 'ASC')
      .addOrderBy('r.name', 'ASC')
      .addOrderBy('s.last_name', 'ASC')
      .addOrderBy('s.first_name', 'ASC');
    const status = filters?.status ?? 'active';
    if (status === 'active') {
      qb.andWhere('s.active = true').andWhere('s.archived_at IS NULL');
    } else if (status === 'alumni') {
      qb.andWhere('(s.active = false OR s.archived_at IS NOT NULL)');
    }
    if (filters?.classId) {
      qb.andWhere('s.class_id = :classId', { classId: filters.classId });
    }
    if (filters?.roomId) {
      qb.andWhere('s.room_id = :roomId', { roomId: filters.roomId });
    }
    return qb.getMany();
  }

  /**
   * Recherche progressive (limite basse). Sans requête, rien n’est renvoyé.
   */
  async search(params: {
    q?: string;
    status?: 'active' | 'alumni' | 'all';
    limit?: number;
  }): Promise<Student[]> {
    const q = (params.q ?? '').trim();
    if (q.length < 2) return [];
    const status = params.status ?? 'active';
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
    const qb = this.studentRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.class', 'c')
      .leftJoinAndSelect('s.room', 'r')
      .orderBy('s.last_name', 'ASC')
      .addOrderBy('s.first_name', 'ASC')
      .take(limit);

    if (status === 'active') {
      qb.andWhere('s.active = true').andWhere('s.archived_at IS NULL');
    } else if (status === 'alumni') {
      qb.andWhere('(s.active = false OR s.archived_at IS NOT NULL)');
    }

    qb.andWhere(
      `(LOWER(s.first_name) LIKE LOWER(:q)
        OR LOWER(s.last_name) LIKE LOWER(:q)
        OR LOWER(COALESCE(s.management_code, '')) LIKE LOWER(:q)
        OR LOWER(COALESCE(s.order_number, '')) LIKE LOWER(:q)
        OR LOWER(s.last_name || ' ' || s.first_name) LIKE LOWER(:q)
        OR LOWER(s.first_name || ' ' || s.last_name) LIKE LOWER(:q))`,
      { q: `%${q}%` },
    );

    return qb.getMany();
  }

  async findOne(id: string): Promise<Student> {
    const s = await this.studentRepo.findOne({
      where: { id },
      relations: ['class', 'room'],
    });
    if (!s) {
      throw new NotFoundException('Student not found');
    }
    return s;
  }

  /** Valide salle ↔ classe et capacité. */
  private async resolveRoomForClass(
    classId: string,
    roomId: string | null | undefined,
    excludeStudentId?: string,
  ): Promise<Room | null> {
    if (!roomId) return null;
    const room = await this.roomsService.findEntity(roomId);
    const roomClassId = room.class?.id ?? null;
    if (roomClassId && roomClassId !== classId) {
      throw new BadRequestException(
        'Cette salle n’appartient pas à la classe sélectionnée',
      );
    }
    await this.roomsService.assertCanAcceptStudent(roomId, excludeStudentId);
    return room;
  }

  async create(params: {
    first_name: string;
    last_name: string;
    class_id: string;
    room_id?: string | null;
    order_number?: string | null;
    academic_year_id?: string;
    email?: string;
    phone?: string;
    address?: string;
    birth_date?: string;
    birth_place?: string;
    gender?: string;
    photo_identity_student?: string;
    photo_identity_mother?: string;
    photo_identity_father?: string;
    photo_identity_responsible?: string;
    mother_name?: string;
    mother_phone?: string;
    father_name?: string;
    father_phone?: string;
    responsible_name?: string;
    responsible_phone?: string;
  }): Promise<Student> {
    if (!params.class_id?.trim()) {
      throw new BadRequestException('La classe est obligatoire.');
    }
    const nisu = await this.nisuForClass(params.class_id, params.order_number);
    // Salle optionnelle à la création (import PDF / inscription progressive → Fiche élève).
    const room = params.room_id?.trim()
      ? await this.resolveRoomForClass(params.class_id, params.room_id)
      : null;
    const management_code = await this.allocateManagementCode();
    const student = this.studentRepo.create({
      order_number: nisu,
      management_code,
      first_name: params.first_name.trim(),
      last_name: params.last_name.trim(),
      email: params.email?.trim(),
      phone: params.phone?.trim(),
      address: params.address?.trim(),
      birth_date: params.birth_date ? new Date(params.birth_date) : undefined,
      birth_place: params.birth_place?.trim(),
      gender: params.gender?.trim(),
      photo_identity_student: params.photo_identity_student?.trim() || undefined,
      photo_identity_mother: params.photo_identity_mother?.trim() || undefined,
      photo_identity_father: params.photo_identity_father?.trim() || undefined,
      photo_identity_responsible:
        params.photo_identity_responsible?.trim() || undefined,
      mother_name: params.mother_name?.trim() || undefined,
      mother_phone: params.mother_phone?.trim() || undefined,
      father_name: params.father_name?.trim() || undefined,
      father_phone: params.father_phone?.trim() || undefined,
      responsible_name: params.responsible_name?.trim() || undefined,
      responsible_phone: params.responsible_phone?.trim() || undefined,
      class: { id: params.class_id },
      room,
      active: true,
    });
    let saved: Student;
    try {
      saved = await this.studentRepo.save(student);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new BadRequestException(
          `Le NISU « ${nisu} » est déjà utilisé — un élève ne peut pas être inscrit deux fois.`,
        );
      }
      throw err;
    }
    if (params.academic_year_id) {
      await this.formationClasseService.addStudentToClass(
        saved.id,
        params.academic_year_id,
        params.class_id,
      );
    }
    const created = await this.findOne(saved.id);
    // Provision parent uniquement à l’inscription (pas aux MAJ — sinon delete annulé).
    await this.attachGuardianQuietly(created, { provision: true });
    return created;
  }

  private async attachGuardianQuietly(
    student: Student,
    opts?: { provision?: boolean },
  ): Promise<void> {
    try {
      await this.parentAccounts.ensureForStudent(student, opts);
    } catch (err: any) {
      this.logger.warn(
        `Compte parent non provisionné pour ${student.last_name} ${student.first_name}: ${err?.message || err}`,
      );
    }
  }

  /**
   * NISU obligatoire hors formation supérieure.
   * Au supérieur : pas de NISU — on stocke null (plusieurs NULL OK pour l’unicité PG).
   */
  private async nisuForClass(
    classId: string,
    raw: string | null | undefined,
    excludeStudentId?: string,
  ): Promise<string | null> {
    const cls = await this.classesService.findOne(classId);
    const nisu = normalizeNisu(raw);
    if (isHigherEducationLevel(cls.level)) {
      if (nisu) await this.assertNisuAvailable(nisu, excludeStudentId);
      return nisu || null;
    }
    if (!nisu) {
      throw new BadRequestException('Le NISU (identifiant unique élève) est obligatoire.');
    }
    await this.assertNisuAvailable(nisu, excludeStudentId);
    return nisu;
  }

  /** NISU unique global (Haïti) — refuse tout doublon. Usage interne / sensible. */
  private async assertNisuAvailable(nisu: string, excludeStudentId?: string): Promise<void> {
    const existing = await this.studentRepo.findOne({ where: { order_number: nisu } });
    if (existing && existing.id !== excludeStudentId) {
      throw new BadRequestException(
        `Le NISU « ${nisu} » est déjà utilisé — un élève ne peut pas être inscrit deux fois.`,
      );
    }
  }

  /** Code de gestion public (badge, fiche) — distinct du NISU. */
  private async allocateManagementCode(): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const seq = (await this.studentRepo.count()) + 1 + attempt;
      const code = `CG-${String(seq).padStart(6, '0')}`;
      const exists = await this.studentRepo.findOne({ where: { management_code: code } });
      if (!exists) return code;
    }
    const suffix = Date.now().toString(36).toUpperCase().slice(-6);
    return `CG-${suffix}`;
  }

  async update(
    id: string,
    params: Partial<{
      first_name: string;
      last_name: string;
      class_id: string;
      room_id: string | null;
      order_number: string | null;
      email: string;
      phone: string;
      address: string;
      birth_date: string;
      birth_place: string;
      gender: string;
      active: boolean;
      photo_identity_student: string;
      photo_identity_mother: string;
      photo_identity_father: string;
      photo_identity_responsible: string;
      mother_name: string;
      mother_phone: string;
      father_name: string;
      father_phone: string;
      responsible_name: string;
      responsible_phone: string;
    }>,
  ): Promise<Student> {
    const student = await this.studentRepo.findOne({
      where: { id },
      relations: ['class', 'room'],
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (!student.management_code?.trim()) {
      student.management_code = await this.allocateManagementCode();
    }
    if (params.first_name !== undefined) student.first_name = params.first_name.trim();
    if (params.last_name !== undefined) student.last_name = params.last_name.trim();
    if (params.class_id !== undefined) student.class = { id: params.class_id } as Class;

    const classId = params.class_id ?? student.class?.id;
    if (!classId) {
      throw new BadRequestException('La classe est obligatoire.');
    }
    if (params.order_number !== undefined || params.class_id !== undefined) {
      const raw =
        params.order_number !== undefined ? params.order_number : student.order_number;
      student.order_number = await this.nisuForClass(classId, raw, id);
    }
    if (params.room_id !== undefined) {
      if (!params.room_id?.trim()) {
        student.room = null;
      } else {
        const room = await this.resolveRoomForClass(classId, params.room_id, id);
        if (!room) {
          throw new BadRequestException('Salle introuvable');
        }
        student.room = room;
      }
    } else if (params.class_id !== undefined && student.room?.id) {
      const room = await this.roomsService.findEntity(student.room.id).catch(() => null);
      if (!room || (room.class?.id && room.class.id !== params.class_id)) {
        student.room = null;
      }
    }

    if (params.email !== undefined) student.email = params.email.trim() || undefined;
    if (params.phone !== undefined) student.phone = params.phone.trim() || undefined;
    if (params.address !== undefined) student.address = params.address.trim() || undefined;
    if (params.birth_date !== undefined) {
      student.birth_date = params.birth_date ? new Date(params.birth_date) : undefined;
    }
    if (params.birth_place !== undefined) {
      student.birth_place = params.birth_place?.trim() || undefined;
    }
    if (params.gender !== undefined) student.gender = params.gender.trim() || undefined;
    if (params.active !== undefined) student.active = params.active;
    if (params.photo_identity_student !== undefined) {
      student.photo_identity_student =
        params.photo_identity_student?.trim() || undefined;
    }
    if (params.photo_identity_mother !== undefined) {
      student.photo_identity_mother =
        params.photo_identity_mother?.trim() || undefined;
    }
    if (params.photo_identity_father !== undefined) {
      student.photo_identity_father =
        params.photo_identity_father?.trim() || undefined;
    }
    if (params.photo_identity_responsible !== undefined) {
      student.photo_identity_responsible =
        params.photo_identity_responsible?.trim() || undefined;
    }
    if (params.mother_name !== undefined) {
      student.mother_name = params.mother_name?.trim() || undefined;
    }
    if (params.mother_phone !== undefined) {
      student.mother_phone = params.mother_phone?.trim() || undefined;
    }
    if (params.father_name !== undefined) {
      student.father_name = params.father_name?.trim() || undefined;
    }
    if (params.father_phone !== undefined) {
      student.father_phone = params.father_phone?.trim() || undefined;
    }
    if (params.responsible_name !== undefined) {
      student.responsible_name = params.responsible_name?.trim() || undefined;
    }
    if (params.responsible_phone !== undefined) {
      student.responsible_phone = params.responsible_phone?.trim() || undefined;
    }
    try {
      await this.studentRepo.save(student);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new BadRequestException(
          `Le NISU « ${student.order_number} » est déjà utilisé — un élève ne peut pas être inscrit deux fois.`,
        );
      }
      throw err;
    }
    const updated = await this.findOne(id);
    // Lien vers un parent déjà existant seulement — jamais de nouveau compte.
    await this.attachGuardianQuietly(updated, { provision: false });
    return updated;
  }

  async findByOrderNumber(orderNumber: string): Promise<Student | null> {
    const nisu = normalizeNisu(orderNumber);
    if (!nisu) return null;
    return this.studentRepo.findOne({
      where: { order_number: nisu },
      relations: ['class', 'room'],
    });
  }

  /**
   * Retire l’élève de l’année en cours. Le dossier (notes, paiements, parcours) reste.
   * Ne jamais hard-delete : un élève « supprimé » devient un ancien élève.
   */
  async archive(id: string, reason: ArchiveReason = 'REMOVED'): Promise<Student> {
    const student = await this.findOne(id);
    if (student.archived_at) return student;
    student.active = false;
    student.archived_at = new Date();
    student.archive_reason = reason;
    student.room = null;
    await this.studentRepo.save(student);

    const profiles = await this.schoolProfileRepo.find({ take: 1 });
    const yearId = profiles[0]?.current_academic_year_id;
    if (yearId) {
      const previous = await this.assignmentRepo.find({
        where: {
          student: { id },
          academic_year: { id: yearId },
        },
      });
      if (previous.length) await this.assignmentRepo.remove(previous);
    }
    this.syncKick.kick('student-archive');
    return this.findOne(id);
  }

  /** Conservé pour l’API DELETE : archive, ne détruit pas le dossier. */
  async delete(id: string): Promise<Student> {
    return this.archive(id, 'REMOVED');
  }

  /** Import en masse depuis un CSV (UTF-8, séparateur ;). Première ligne = en-têtes. */
  async importFromCsv(csvContent: string, academicYearId: string): Promise<ImportResult> {
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const lines = csvContent.split(/\r?\n/).map((line) => line.split(';').map((cell) => cell.trim()));
    if (lines.length < 2) {
      result.errors.push({ row: 0, message: 'Fichier vide ou une seule ligne (en-têtes requis).' });
      return result;
    }
    const headerRow = lines[0].map((h) => h.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/\p{Diacritic}/gu, ''));
    const idx = (names: string[]) => {
      const i = headerRow.findIndex((h) => names.some((n) => h === n || h.includes(n)));
      return i >= 0 ? i : -1;
    };
    const iOrder = idx(['identifiant', 'order_number', 'numero_ministere', 'numero']);
    const iPrenom = idx(['prenom', 'first_name']);
    const iNom = idx(['nom', 'last_name']);
    const iClasse = idx(['classe', 'class']);
    if (iOrder < 0 || iPrenom < 0 || iNom < 0 || iClasse < 0) {
      result.errors.push({
        row: 0,
        message: 'En-têtes requis : Identifiant (ou N° ministère), Prénom, Nom, Classe. Voir le modèle.',
      });
      return result;
    }
    const iDate = idx(['date_naissance', 'date_naissance', 'birth_date', 'date']);
    const iGenre = idx(['genre', 'gender']);
    const iTel = idx(['telephone', 'tel', 'phone']);
    const iEmail = idx(['email']);
    const iNomMere = idx(['nom_mere', 'mere', 'mother_name']);
    const iTelMere = idx(['tel_mere', 'telephone_mere']);
    const iNomPere = idx(['nom_pere', 'pere', 'father_name']);
    const iTelPere = idx(['tel_pere', 'telephone_pere']);

    const allClasses = await this.classesService.findAll();
    const classByName = new Map<string, string>(allClasses.map((c) => [c.name.trim(), c.id]));
    const seenInBatch = new Set<string>();

    for (let r = 1; r < lines.length; r++) {
      const row = lines[r];
      const rowNum = r + 1;
      const get = (i: number) => (i >= 0 && i < row.length ? (row[i] ?? '').trim() : '');
      const orderNumber = normalizeNisu(get(iOrder));
      const first_name = get(iPrenom);
      const last_name = get(iNom);
      const className = get(iClasse);
      if (!orderNumber) {
        result.errors.push({ row: rowNum, message: 'NISU manquant.' });
        continue;
      }
      if (seenInBatch.has(orderNumber)) {
        result.errors.push({
          row: rowNum,
          message: `NISU « ${orderNumber} » en double dans le fichier — refusé.`,
        });
        continue;
      }
      seenInBatch.add(orderNumber);
      if (!first_name || !last_name) {
        result.errors.push({ row: rowNum, message: 'Prénom et nom obligatoires.' });
        continue;
      }
      if (!className) {
        result.errors.push({ row: rowNum, message: 'Classe manquante.' });
        continue;
      }
      const classId = classByName.get(className);
      if (!classId) {
        result.errors.push({ row: rowNum, message: `Classe « ${className} » introuvable. Créez-la d'abord.` });
        continue;
      }
      const existing = await this.studentRepo.findOne({ where: { order_number: orderNumber } });
      if (existing) {
        result.skipped++;
        continue;
      }
      const birth_date = get(iDate);
      const gender = get(iGenre);
      const phone = get(iTel);
      const email = get(iEmail);
      const mother_name = get(iNomMere);
      const mother_phone = get(iTelMere);
      const father_name = get(iNomPere);
      const father_phone = get(iTelPere);
      try {
        await this.create({
          order_number: orderNumber,
          first_name,
          last_name,
          class_id: classId,
          academic_year_id: academicYearId,
          birth_date: birth_date && /^\d{4}-\d{2}-\d{2}$/.test(birth_date) ? birth_date : undefined,
          gender: gender || undefined,
          phone: phone || undefined,
          email: email || undefined,
          mother_name: mother_name || undefined,
          mother_phone: mother_phone || undefined,
          father_name: father_name || undefined,
          father_phone: father_phone || undefined,
        });
        result.created++;
      } catch (err: any) {
        result.errors.push({ row: rowNum, message: err?.message || 'Erreur à l\'enregistrement.' });
      }
    }
    return result;
  }

  /** Aperçu d’un PDF de liste (heuristique puis IA) — sans écriture en base. */
  async previewPdfImport(buffer: Buffer): Promise<{
    rows: import('./student-pdf-import').ParsedStudentRow[];
    header_found: boolean;
    warnings: string[];
    method: string;
    ai_configured: boolean;
  }> {
    const result = await this.studentAiImport.extractStudentsFromPdf(buffer);
    const warnings = [...(result.warnings ?? [])];
    const seen = new Set<string>();
    const rows: import('./student-pdf-import').ParsedStudentRow[] = [];

    for (const row of result.rows ?? []) {
      const nisu = normalizeNisu(row.order_number);
      if (!nisu) {
        warnings.push(`Ligne ${row.row}: NISU manquant — ignorée.`);
        continue;
      }
      if (seen.has(nisu)) {
        warnings.push(`NISU « ${nisu} » en double dans le PDF — une seule occurrence est gardée.`);
        continue;
      }
      seen.add(nisu);
      const existing = await this.studentRepo.findOne({ where: { order_number: nisu } });
      if (existing) {
        warnings.push(
          `NISU « ${nisu} » déjà inscrit (${existing.last_name} ${existing.first_name}) — non réimportable.`,
        );
        continue;
      }
      rows.push({ ...row, order_number: nisu });
    }

    return {
      ...result,
      rows,
      warnings,
      ai_configured: this.studentAiImport.isAiConfigured(),
    };
  }

  /**
   * Import PDF → élèves dans une classe donnée (sans salle).
   * La salle / photos / contacts se complètent ensuite via Fiche élève.
   */
  async importFromPdf(
    buffer: Buffer,
    classId: string,
    academicYearId?: string | null,
    confirmedRows?: import('./student-pdf-import').ParsedStudentRow[],
  ): Promise<ImportResult> {
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const cls = await this.classesService.findOne(classId).catch(() => null);
    if (!cls) {
      result.errors.push({ row: 0, message: 'Classe introuvable.' });
      return result;
    }

    let rows = confirmedRows;
    if (!rows?.length) {
      const preview = await this.previewPdfImport(buffer);
      if (!preview.rows.length) {
        result.errors.push({
          row: 0,
          message:
            preview.warnings?.[0] ||
            'Aucune ligne élève détectée dans le PDF.',
        });
        return result;
      }
      rows = preview.rows;
    }

    const seenInBatch = new Set<string>();
    for (const row of rows) {
      const orderNumber = normalizeNisu(row.order_number);
      if (!orderNumber) {
        result.errors.push({ row: row.row, message: 'NISU manquant.' });
        continue;
      }
      if (seenInBatch.has(orderNumber)) {
        result.errors.push({
          row: row.row,
          message: `NISU « ${orderNumber} » en double dans la liste — refusé.`,
        });
        continue;
      }
      seenInBatch.add(orderNumber);
      if (!row.first_name?.trim() || !row.last_name?.trim()) {
        result.errors.push({ row: row.row, message: 'Prénom et nom obligatoires.' });
        continue;
      }
      const existing = await this.studentRepo.findOne({ where: { order_number: orderNumber } });
      if (existing) {
        result.skipped++;
        continue;
      }
      try {
        await this.create({
          order_number: orderNumber,
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          class_id: classId,
          academic_year_id: academicYearId || undefined,
          gender: row.gender || undefined,
          birth_date: row.birth_date || undefined,
          birth_place: row.birth_place || undefined,
          room_id: null,
        });
        result.created++;
      } catch (err: any) {
        result.errors.push({
          row: row.row,
          message: err?.message || "Erreur à l'enregistrement.",
        });
      }
    }
    return result;
  }
}
