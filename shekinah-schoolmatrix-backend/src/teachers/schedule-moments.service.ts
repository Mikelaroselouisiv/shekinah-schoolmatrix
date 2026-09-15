import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource, EntityManager, IsNull } from 'typeorm';
import { Class } from '../classes/class.entity';
import { User } from '../users/user.entity';
import {
  ClassDayMoment,
  ClassMomentKind,
} from './class-day-moment.entity';
import {
  SchoolDutyKind,
  SchoolWeekDuty,
} from './school-week-duty.entity';
import {
  isListScheduleLevel,
  MORNING_PRIMAIRE_LEVELS,
} from '../roles/education-levels';
import {
  CLASS_MOMENT_LABELS,
  CLASS_WEEKDAYS,
  MORNING_DUTY_END,
  MORNING_DUTY_START,
  assertTimeRange,
  cleanInstructionLines,
  cleanManualNames,
  morningDutyTitle,
  parseClassMomentKind,
  parseHhMm,
  parseSchoolDutyKind,
  parseWeekday,
  personName,
} from './schedule-day.constants';
import { SchoolOpeningInstruction } from './school-opening-instruction.entity';
import { ClassBringItem } from './class-bring-item.entity';
import { BringItemCatalog } from './bring-item-catalog.entity';
import { ClassDaySubject } from './class-day-subject.entity';
import { Subject } from '../subjects/subject.entity';
import { isTeacherRoleName } from '../roles/roles.constants';

export type ClassDayListDto = {
  day_of_week: number;
  subject_ids: string[];
  subject_names: string[];
  materials: string[];
};

export type ClassDayListDayBody = {
  day_of_week: number;
  subject_ids?: string[];
  materials?: string[];
};

export type ClassDayMomentDto = {
  id: string;
  class_id: string;
  class_name: string | null;
  academic_year: string | null;
  kind: ClassMomentKind;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SchoolWeekDutyDto = {
  id: string;
  academic_year: string;
  kind: SchoolDutyKind;
  title: string;
  cycle: string | null;
  class_id: string | null;
  class_name: string | null;
  class_level: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  responsible_user_id: number | null;
  responsible_name: string | null;
  manual_name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type MorningOpeningDayBody = {
  day_of_week: number;
  preschool?: {
    accueil_ids?: number[];
    flag_ids?: number[];
    animation_ids?: number[];
    service_names?: string[];
  };
  primary?: {
    accueil_ids?: number[];
    devotion_ids?: number[];
    flag_class_id?: string | null;
    defi_ids?: number[];
    prayer_names?: string[];
  };
  /** Ancien format (migré). */
  flag_class_id?: string | null;
  preschool_teacher_ids?: number[];
  primary_teacher_ids?: number[];
};

@Injectable()
export class ScheduleMomentsService {
  constructor(
    @InjectRepository(ClassDayMoment)
    private readonly momentRepo: Repository<ClassDayMoment>,
    @InjectRepository(SchoolWeekDuty)
    private readonly dutyRepo: Repository<SchoolWeekDuty>,
    @InjectRepository(SchoolOpeningInstruction)
    private readonly instructionRepo: Repository<SchoolOpeningInstruction>,
    @InjectRepository(ClassBringItem)
    private readonly bringRepo: Repository<ClassBringItem>,
    @InjectRepository(BringItemCatalog)
    private readonly catalogRepo: Repository<BringItemCatalog>,
    @InjectRepository(ClassDaySubject)
    private readonly daySubjectRepo: Repository<ClassDaySubject>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  private toMomentDto(m: ClassDayMoment): ClassDayMomentDto {
    const title =
      m.label?.trim() || CLASS_MOMENT_LABELS[m.kind] || m.kind;
    return {
      id: m.id,
      class_id: m.class?.id ?? m.class_id,
      class_name: m.class?.name ?? null,
      academic_year: m.academic_year ?? null,
      kind: m.kind,
      title,
      day_of_week: m.day_of_week,
      start_time: m.start_time,
      end_time: m.end_time,
      label: m.label ?? null,
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  }

  private toDutyDto(d: SchoolWeekDuty): SchoolWeekDutyDto {
    return {
      id: d.id,
      academic_year: d.academic_year,
      kind: d.kind,
      title: morningDutyTitle(d.kind, d.cycle),
      cycle: d.cycle ?? null,
      class_id: d.class?.id ?? d.class_id ?? null,
      class_name: d.class?.name ?? null,
      class_level: d.class?.level ?? null,
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
      responsible_user_id: d.responsible?.id ?? d.responsible_user_id ?? null,
      responsible_name: d.manual_name?.trim() || personName(d.responsible),
      manual_name: d.manual_name ?? null,
      created_at: d.created_at,
      updated_at: d.updated_at,
    };
  }

  async listClassMoments(filters: {
    class_id?: string;
    academic_year?: string;
    kind?: string;
    day_of_week?: number;
  }): Promise<ClassDayMomentDto[]> {
    const qb = this.momentRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.class', 'class')
      .orderBy('m.day_of_week', 'ASC')
      .addOrderBy('m.start_time', 'ASC');
    if (filters.class_id) {
      qb.andWhere('m.class_id = :class_id', { class_id: filters.class_id });
    }
    if (filters.academic_year) {
      qb.andWhere('m.academic_year = :academic_year', {
        academic_year: filters.academic_year,
      });
    }
    if (filters.kind) {
      qb.andWhere('m.kind = :kind', {
        kind: parseClassMomentKind(filters.kind),
      });
    }
    if (filters.day_of_week != null) {
      qb.andWhere('m.day_of_week = :day', {
        day: parseWeekday(filters.day_of_week),
      });
    }
    const rows = await qb.getMany();
    return rows.map((m) => this.toMomentDto(m));
  }

  async createClassMoments(body: {
    class_id: string;
    academic_year?: string;
    kind: string;
    days?: number[];
    day_of_week?: number;
    start_time: string;
    end_time: string;
    label?: string | null;
  }): Promise<ClassDayMomentDto[]> {
    if (!body.class_id?.trim()) {
      throw new BadRequestException('class_id requis');
    }
    const cls = await this.classRepo.findOne({ where: { id: body.class_id } });
    if (!cls) throw new BadRequestException('Classe introuvable');
    const kind = parseClassMomentKind(body.kind);
    const start = parseHhMm(body.start_time, 'début');
    const end = parseHhMm(body.end_time, 'fin');
    assertTimeRange(start, end);
    const days = (body.days?.length
      ? body.days
      : body.day_of_week != null
        ? [body.day_of_week]
        : [...CLASS_WEEKDAYS]
    ).map((d) => parseWeekday(d));
    const uniqueDays = [...new Set(days)];
    const year = body.academic_year?.trim() || null;
    const label = body.label?.trim() || null;
    const saved: ClassDayMoment[] = [];
    for (const day of uniqueDays) {
      const row = this.momentRepo.create({
        class_id: cls.id,
        class: cls,
        academic_year: year,
        kind,
        day_of_week: day,
        start_time: start,
        end_time: end,
        label,
      });
      saved.push(await this.momentRepo.save(row));
    }
    return saved.map((m) => this.toMomentDto({ ...m, class: cls }));
  }

  async updateClassMoment(
    id: string,
    body: Partial<{
      kind: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      label: string | null;
    }>,
  ): Promise<ClassDayMomentDto> {
    const row = await this.momentRepo.findOne({
      where: { id },
      relations: ['class'],
    });
    if (!row) throw new NotFoundException('Moment introuvable');
    if (body.kind !== undefined) row.kind = parseClassMomentKind(body.kind);
    if (body.day_of_week !== undefined) {
      row.day_of_week = parseWeekday(body.day_of_week);
    }
    if (body.start_time !== undefined) {
      row.start_time = parseHhMm(body.start_time, 'début');
    }
    if (body.end_time !== undefined) {
      row.end_time = parseHhMm(body.end_time, 'fin');
    }
    assertTimeRange(row.start_time, row.end_time);
    if (body.label !== undefined) {
      row.label = body.label?.trim() || null;
    }
    return this.toMomentDto(await this.momentRepo.save(row));
  }

  async deleteClassMoment(id: string): Promise<void> {
    const row = await this.momentRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Moment introuvable');
    await this.momentRepo.remove(row);
  }

  async listDuties(filters: {
    academic_year?: string;
    kind?: string;
  }): Promise<SchoolWeekDutyDto[]> {
    const qb = this.dutyRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.responsible', 'responsible')
      .leftJoinAndSelect('d.class', 'class')
      .orderBy('d.day_of_week', 'ASC')
      .addOrderBy('d.kind', 'ASC');
    if (filters.academic_year) {
      qb.andWhere('d.academic_year = :academic_year', {
        academic_year: filters.academic_year,
      });
    }
    if (filters.kind) {
      qb.andWhere('d.kind = :kind', {
        kind: parseSchoolDutyKind(filters.kind),
      });
    }
    const rows = await qb.getMany();
    return rows.map((d) => this.toDutyDto(d));
  }

  async upsertWeekDuties(body: {
    academic_year: string;
    days: MorningOpeningDayBody[];
    preschool_instructions?: string[];
    primary_instructions?: string[];
  }): Promise<{
    school_week_duties: SchoolWeekDutyDto[];
    preschool_instructions: string[];
    primary_instructions: string[];
  }> {
    const year = body.academic_year?.trim();
    if (!year) throw new BadRequestException('academic_year requis');
    if (!Array.isArray(body.days) || body.days.length === 0) {
      throw new BadRequestException('Indiquez au moins un jour');
    }

    const uniqueIds = [
      ...new Set(
        body.days.flatMap((d) => [
          ...(d.preschool?.accueil_ids ?? []),
          ...(d.preschool?.flag_ids ?? []),
          ...(d.preschool?.animation_ids ?? []),
          ...(d.primary?.accueil_ids ?? []),
          ...(d.primary?.devotion_ids ?? []),
          ...(d.primary?.defi_ids ?? []),
          ...(d.preschool_teacher_ids ?? []),
          ...(d.primary_teacher_ids ?? []),
        ]),
      ),
    ].filter((id) => Number.isInteger(id));
    const users =
      uniqueIds.length > 0
        ? await this.userRepo.find({ where: { id: In(uniqueIds) }, relations: ['role'] })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    for (const id of uniqueIds) {
      if (!userById.has(id)) {
        throw new BadRequestException(`Utilisateur ${id} introuvable`);
      }
    }

    const flagIds = [
      ...new Set(
        body.days
          .map((d) => (d.primary?.flag_class_id ?? d.flag_class_id)?.trim())
          .filter((id): id is string => !!id),
      ),
    ];
    const flagClasses =
      flagIds.length > 0
        ? await this.classRepo.find({ where: { id: In(flagIds) } })
        : [];
    const classById = new Map(flagClasses.map((c) => [c.id, c]));
    for (const id of flagIds) {
      const cls = classById.get(id);
      if (!cls) throw new BadRequestException(`Classe ${id} introuvable`);
      if (!(MORNING_PRIMAIRE_LEVELS as readonly string[]).includes(cls.level ?? '')) {
        throw new BadRequestException(
          `La montée du drapeau primaire concerne une classe du 1er ou 2e cycle (${cls.name})`,
        );
      }
    }

    const saveUserDuty = async (
      manager: EntityManager,
      day: number,
      kind: SchoolWeekDuty['kind'],
      cycle: 'PRESCOLAIRE' | 'PRIMAIRE',
      uid: number,
    ) => {
      const user = userById.get(uid);
      if (!user) return;
      await manager.save(
        manager.create(SchoolWeekDuty, {
          academic_year: year,
          kind,
          cycle,
          class_id: null,
          class: null,
          day_of_week: day,
          start_time: MORNING_DUTY_START,
          end_time: MORNING_DUTY_END,
          responsible_user_id: user.id,
          responsible: user,
          manual_name: null,
        }),
      );
    };

    await this.dataSource.transaction(async (manager) => {
      const oldDuties = await manager.find(SchoolWeekDuty, {
        where: { academic_year: year },
      });
      const oldNotes = await manager.find(SchoolOpeningInstruction, {
        where: { academic_year: year },
      });
      if (oldDuties.length) await manager.remove(oldDuties);
      if (oldNotes.length) await manager.remove(oldNotes);

      const saveManual = async (
        day: number,
        kind: SchoolWeekDuty['kind'],
        cycle: 'PRESCOLAIRE' | 'PRIMAIRE',
        names: string[],
      ) => {
        for (const name of cleanManualNames(names)) {
          await manager.save(
            manager.create(SchoolWeekDuty, {
              academic_year: year,
              kind,
              cycle,
              class_id: null,
              class: null,
              day_of_week: day,
              start_time: MORNING_DUTY_START,
              end_time: MORNING_DUTY_END,
              responsible_user_id: null,
              responsible: null,
              manual_name: name,
            }),
          );
        }
      };

      for (const dayBody of body.days) {
        const day = parseWeekday(dayBody.day_of_week);
        if (day < 1 || day > 5) continue;
        const preschool = dayBody.preschool ?? {};
        const primary = dayBody.primary ?? {};
        const preschoolAccueil = preschool.accueil_ids ?? dayBody.preschool_teacher_ids ?? [];
        const primaryAccueil = primary.accueil_ids ?? dayBody.primary_teacher_ids ?? [];
        const flagClassId = (primary.flag_class_id ?? dayBody.flag_class_id)?.trim() || '';

        for (const uid of [...new Set(preschoolAccueil)]) {
          await saveUserDuty(manager, day, 'ACCUEIL', 'PRESCOLAIRE', uid);
        }
        for (const uid of [...new Set(preschool.flag_ids ?? [])]) {
          await saveUserDuty(manager, day, 'FLAG', 'PRESCOLAIRE', uid);
        }
        for (const uid of [...new Set(preschool.animation_ids ?? [])]) {
          await saveUserDuty(manager, day, 'ANIMATION', 'PRESCOLAIRE', uid);
        }
        await saveManual(day, 'SERVICE', 'PRESCOLAIRE', preschool.service_names ?? []);

        for (const uid of [...new Set(primaryAccueil)]) {
          await saveUserDuty(manager, day, 'ACCUEIL', 'PRIMAIRE', uid);
        }
        for (const uid of [...new Set(primary.devotion_ids ?? [])]) {
          await saveUserDuty(manager, day, 'DEVOTION', 'PRIMAIRE', uid);
        }
        if (flagClassId) {
          const cls = classById.get(flagClassId)!;
          await manager.save(
            manager.create(SchoolWeekDuty, {
              academic_year: year,
              kind: 'FLAG',
              cycle: 'PRIMAIRE',
              class_id: cls.id,
              class: cls,
              day_of_week: day,
              start_time: MORNING_DUTY_START,
              end_time: MORNING_DUTY_END,
              responsible_user_id: null,
              responsible: null,
              manual_name: null,
            }),
          );
        }
        for (const uid of [...new Set(primary.defi_ids ?? [])]) {
          await saveUserDuty(manager, day, 'DEFI', 'PRIMAIRE', uid);
        }
        await saveManual(day, 'PRIERE', 'PRIMAIRE', primary.prayer_names ?? []);
      }

      const saveNotes = async (cycle: 'PRESCOLAIRE' | 'PRIMAIRE', lines: string[]) => {
        let order = 0;
        for (const text of cleanInstructionLines(lines)) {
          await manager.save(
            manager.create(SchoolOpeningInstruction, {
              academic_year: year,
              cycle,
              sort_order: order++,
              text,
            }),
          );
        }
      };
      await saveNotes('PRESCOLAIRE', body.preschool_instructions ?? []);
      await saveNotes('PRIMAIRE', body.primary_instructions ?? []);
    });

    return this.getOpeningProgram(year);
  }

  async getOpeningProgram(academicYear: string): Promise<{
    school_week_duties: SchoolWeekDutyDto[];
    preschool_instructions: string[];
    primary_instructions: string[];
  }> {
    const [school_week_duties, notes] = await Promise.all([
      this.listDuties({ academic_year: academicYear }),
      this.instructionRepo.find({
        where: { academic_year: academicYear },
        order: { sort_order: 'ASC' },
      }),
    ]);
    return {
      school_week_duties,
      preschool_instructions: notes.filter((n) => n.cycle === 'PRESCOLAIRE').map((n) => n.text),
      primary_instructions: notes.filter((n) => n.cycle === 'PRIMAIRE').map((n) => n.text),
    };
  }

  async listStaffOptions(): Promise<{ id: number; name: string; role: string }[]> {
    const users = await this.userRepo.find({
      where: { active: true },
      relations: ['role'],
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
    return users
      .filter((u) => {
        const role = u.role?.name ?? '';
        if (!role || role.toUpperCase() === 'PARENT') return false;
        if (isTeacherRoleName(role)) return false;
        return true;
      })
      .map((u) => ({
        id: u.id,
        name: personName(u) || `#${u.id}`,
        role: u.role?.name ?? '',
      }));
  }

  async listDayLists(classId: string, academicYear?: string): Promise<ClassDayListDto[]> {
    if (!classId) throw new BadRequestException('class_id requis');
    const days: ClassDayListDto[] = CLASS_WEEKDAYS.map((d) => ({
      day_of_week: d,
      subject_ids: [],
      subject_names: [],
      materials: [],
    }));
    const byDay = new Map(days.map((d) => [d.day_of_week, d]));

    const subjQb = this.daySubjectRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.subject', 'subject')
      .where('s.class_id = :classId', { classId })
      .orderBy('s.sort_order', 'ASC')
      .addOrderBy('s.created_at', 'ASC');
    if (academicYear) subjQb.andWhere('s.academic_year = :y', { y: academicYear });
    const subjects = await subjQb.getMany();
    for (const row of subjects) {
      const slot = byDay.get(row.day_of_week);
      if (!slot) continue;
      if (slot.subject_ids.includes(row.subject_id)) continue;
      slot.subject_ids.push(row.subject_id);
      const name = row.subject?.name?.trim();
      if (name) slot.subject_names.push(name);
    }

    const bringQb = this.bringRepo
      .createQueryBuilder('b')
      .where('b.class_id = :classId', { classId })
      .orderBy('b.sort_order', 'ASC')
      .addOrderBy('b.created_at', 'ASC');
    if (academicYear) bringQb.andWhere('b.academic_year = :y', { y: academicYear });
    const brings = await bringQb.getMany();
    for (const row of brings) {
      const slot = byDay.get(row.day_of_week);
      if (!slot) continue;
      const label = row.label?.trim();
      if (!label) continue;
      if (slot.materials.some((x) => x.toLowerCase() === label.toLowerCase())) continue;
      slot.materials.push(label);
    }
    return days;
  }

  async listBringCatalog(): Promise<string[]> {
    const rows = await this.listBringCatalogItems();
    return rows.map((r) => r.label);
  }

  async listBringCatalogItems(): Promise<{ id: string; label: string }[]> {
    const rows = await this.catalogRepo.find({ order: { label: 'ASC' } });
    return rows.map((r) => ({ id: r.id, label: r.label }));
  }

  async createBringCatalogItem(raw: string): Promise<{ id: string; label: string }> {
    const label = this.catalogLabels([raw])[0];
    if (!label) throw new BadRequestException('Nom requis');
    const existing = await this.catalogRepo
      .createQueryBuilder('c')
      .where('LOWER(c.label) = LOWER(:label)', { label })
      .getOne();
    if (existing) throw new BadRequestException('Ce matériel existe déjà');
    const saved = await this.catalogRepo.save(this.catalogRepo.create({ label }));
    return { id: saved.id, label: saved.label };
  }

  async updateBringCatalogItem(
    id: string,
    raw: string,
  ): Promise<{ id: string; label: string }> {
    const row = await this.catalogRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Matériel introuvable');
    const label = this.catalogLabels([raw])[0];
    if (!label) throw new BadRequestException('Nom requis');
    const clash = await this.catalogRepo
      .createQueryBuilder('c')
      .where('LOWER(c.label) = LOWER(:label)', { label })
      .andWhere('c.id <> :id', { id })
      .getOne();
    if (clash) throw new BadRequestException('Ce matériel existe déjà');
    const previous = row.label;
    row.label = label;
    const saved = await this.catalogRepo.save(row);
    if (previous.toLowerCase() !== label.toLowerCase()) {
      const uses = await this.bringRepo
        .createQueryBuilder('b')
        .where('LOWER(b.label) = LOWER(:previous)', { previous })
        .getMany();
      for (const use of uses) {
        use.label = label;
        await this.bringRepo.save(use);
      }
    }
    return { id: saved.id, label: saved.label };
  }

  async removeBringCatalogItem(id: string): Promise<void> {
    const row = await this.catalogRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Matériel introuvable');
    const uses = await this.bringRepo
      .createQueryBuilder('b')
      .where('LOWER(b.label) = LOWER(:label)', { label: row.label })
      .getMany();
    if (uses.length) await this.bringRepo.remove(uses);
    await this.catalogRepo.remove(row);
  }

  private catalogLabels(raw?: string[] | null): string[] {
    return cleanInstructionLines(raw).map((s) => s.slice(0, 160));
  }

  private async upsertBringCatalog(
    labels: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(BringItemCatalog) : this.catalogRepo;
    for (const label of this.catalogLabels(labels)) {
      const existing = await repo
        .createQueryBuilder('c')
        .where('LOWER(c.label) = LOWER(:label)', { label })
        .getOne();
      if (existing) continue;
      try {
        await repo.save(repo.create({ label }));
      } catch {
        // collision concurrente sur l’index unique
      }
    }
  }

  async replaceDayLists(body: {
    class_id: string;
    academic_year?: string | null;
    days: ClassDayListDayBody[];
  }): Promise<ClassDayListDto[]> {
    const classId = body.class_id?.trim();
    if (!classId) throw new BadRequestException('class_id requis');
    const cls = await this.classRepo.findOne({ where: { id: classId } });
    if (!cls) throw new BadRequestException('Classe introuvable');
    if (!isListScheduleLevel(cls.level)) {
      throw new BadRequestException(
        'Les listes par jour concernent le préscolaire et le 1er / 2e cycle fondamental.',
      );
    }
    const year = body.academic_year?.trim() || null;
    const incoming = Array.isArray(body.days) ? body.days : [];
    const allSubjectIds = [
      ...new Set(incoming.flatMap((d) => d.subject_ids ?? []).filter(Boolean)),
    ];
    const subjects =
      allSubjectIds.length > 0
        ? await this.subjectRepo.find({ where: { id: In(allSubjectIds) } })
        : [];
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    for (const id of allSubjectIds) {
      if (!subjectById.has(id)) {
        throw new BadRequestException(`Matière ${id} introuvable`);
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const subWhere = year
        ? { class_id: classId, academic_year: year }
        : { class_id: classId, academic_year: IsNull() };
      const bringWhere = year
        ? { class_id: classId, academic_year: year }
        : { class_id: classId, academic_year: IsNull() };
      const oldSub = await manager.find(ClassDaySubject, { where: subWhere });
      const oldBring = await manager.find(ClassBringItem, { where: bringWhere });
      if (oldSub.length) await manager.remove(oldSub);
      if (oldBring.length) await manager.remove(oldBring);

      for (const dayBody of incoming) {
        const day = parseWeekday(dayBody.day_of_week);
        if (day < 1 || day > 5) continue;
        let order = 0;
        for (const sid of [...new Set(dayBody.subject_ids ?? [])]) {
          const subject = subjectById.get(sid);
          if (!subject) continue;
          await manager.save(
            manager.create(ClassDaySubject, {
              class_id: classId,
              class: cls,
              academic_year: year,
              day_of_week: day,
              subject_id: subject.id,
              subject,
              sort_order: order++,
            }),
          );
        }
        order = 0;
        for (const label of this.catalogLabels(dayBody.materials)) {
          await manager.save(
            manager.create(ClassBringItem, {
              class_id: classId,
              class: cls,
              academic_year: year,
              day_of_week: day,
              sort_order: order++,
              label,
            }),
          );
        }
      }
      await this.upsertBringCatalog(
        incoming.flatMap((d) => d.materials ?? []),
        manager,
      );
    });
    return this.listDayLists(classId, year ?? undefined);
  }

  async listBringItems(classId: string, academicYear?: string): Promise<{ id: string; label: string }[]> {
    const days = await this.listDayLists(classId, academicYear);
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const d of days) {
      for (const label of d.materials) {
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: `${d.day_of_week}:${label}`, label });
      }
    }
    return out;
  }

  async replaceBringItems(body: {
    class_id: string;
    academic_year?: string | null;
    lines?: string[];
    days?: ClassDayListDayBody[];
  }): Promise<ClassDayListDto[]> {
    if (Array.isArray(body.days) && body.days.length > 0) {
      return this.replaceDayLists({
        class_id: body.class_id,
        academic_year: body.academic_year,
        days: body.days,
      });
    }
    const lines = body.lines ?? [];
    return this.replaceDayLists({
      class_id: body.class_id,
      academic_year: body.academic_year,
      days: CLASS_WEEKDAYS.map((day) => ({
        day_of_week: day,
        subject_ids: [],
        materials: lines,
      })),
    });
  }

  async deleteDuty(id: string): Promise<void> {
    const row = await this.dutyRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Responsabilité introuvable');
    await this.dutyRepo.remove(row);
  }
}
