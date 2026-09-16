import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { alignCurrentYearClass } from './align-current-year-class';
import { StudentClassAssignment } from './student-class-assignment.entity';
import { ClassDecisionThreshold } from './class-decision-threshold.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Grade } from '../grades/grade.entity';
import { ClassSubjectCoefficient } from '../grades/class-subject-coefficient.entity';
import { resolveBareme } from '../grades/grade-scale';
import { DisciplinaryMeasure } from '../discipline/disciplinary-measure.entity';
import { Period } from '../period/period.entity';
import { ScheduleSlot } from '../teachers/schedule-slot.entity';
import { ClassDayMoment } from '../teachers/class-day-moment.entity';
import { SchoolWeekDuty } from '../teachers/school-week-duty.entity';
import { Room } from '../rooms/room.entity';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { isPreschoolClass } from '../utils/preschool';
import {
  DECISION_ADMIS,
  DECISION_ADMIS_AILLEURS,
  DECISION_REDOUBLER,
  DECISION_AJOURNE,
  DECISION_RENVOYE_DEFINITIVEMENT,
  DECISION_EXPELLED,
} from './student-class-assignment.entity';

@Injectable()
export class FormationClasseService {
  constructor(
    @InjectRepository(StudentClassAssignment)
    private readonly assignmentRepo: Repository<StudentClassAssignment>,
    @InjectRepository(ClassDecisionThreshold)
    private readonly thresholdRepo: Repository<ClassDecisionThreshold>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(AcademicYear)
    private readonly academicYearRepo: Repository<AcademicYear>,
    @InjectRepository(Grade)
    private readonly gradeRepo: Repository<Grade>,
    @InjectRepository(ClassSubjectCoefficient)
    private readonly coefRepo: Repository<ClassSubjectCoefficient>,
    @InjectRepository(DisciplinaryMeasure)
    private readonly measureRepo: Repository<DisciplinaryMeasure>,
    @InjectRepository(Period)
    private readonly periodRepo: Repository<Period>,
    @InjectRepository(ScheduleSlot)
    private readonly scheduleSlotRepo: Repository<ScheduleSlot>,
    @InjectRepository(ClassDayMoment)
    private readonly classDayMomentRepo: Repository<ClassDayMoment>,
    @InjectRepository(SchoolWeekDuty)
    private readonly schoolWeekDutyRepo: Repository<SchoolWeekDuty>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(SchoolProfile)
    private readonly schoolProfileRepo: Repository<SchoolProfile>,
    private readonly dataSource: DataSource,
  ) {}

  /** Année en cours : l’affectation suit student.class_id. */
  async alignStudentCurrentYear(studentId: string): Promise<void> {
    await alignCurrentYearClass(this.dataSource, studentId);
  }

  async getStudentsByClassAndYear(academicYearId: string, classId: string): Promise<any[]> {
    const assignments = await this.assignmentRepo.find({
      where: {
        academic_year: { id: academicYearId },
        class: { id: classId },
      },
      relations: ['student', 'class', 'academic_year'],
      order: { student: { last_name: 'ASC', first_name: 'ASC' } as any },
    });
    return assignments
      .filter((a) => a.student && a.student.active !== false && !(a.student as Student).archived_at)
      .map((a) => ({
      id: a.student?.id,
      first_name: a.student?.first_name,
      last_name: a.student?.last_name,
      order_number: (a.student as any)?.order_number,
      management_code: (a.student as any)?.management_code ?? null,
      decision: a.decision,
      average: a.average ? Number(a.average) : null,
      assignment_id: a.id,
    }));
  }

  /** Retourne les élèves d'une classe pour une année. Utilise student_class_assignment si existant, sinon student.class_id. */
  async getClassStudents(academicYearId: string, classId: string): Promise<any[]> {
    const assignments = await this.assignmentRepo.find({
      where: {
        academic_year: { id: academicYearId },
        class: { id: classId },
      },
      relations: ['student', 'student.room', 'class', 'academic_year'],
      order: { student: { last_name: 'ASC', first_name: 'ASC' } as any },
    });
    if (assignments.length > 0) {
      return assignments
        .filter((a) => a.student && a.student.active !== false && !a.student.archived_at)
        .map((a) => ({
        id: a.student?.id,
        first_name: a.student?.first_name,
        last_name: a.student?.last_name,
        order_number: (a.student as Student)?.order_number,
        management_code: (a.student as Student)?.management_code ?? null,
        room_id: a.student?.room?.id ?? null,
        room_name: a.student?.room?.name ?? null,
        decision: a.decision,
        average: a.average ? Number(a.average) : null,
        assignment_id: a.id,
      }));
    }
    // Fallback: étudiants avec class_id actuel (pour première année ou compatibilité)
    const students = await this.studentRepo.find({
      where: { class: { id: classId }, active: true },
      relations: ['class', 'room'],
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
    return students.map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      order_number: s.order_number,
      management_code: s.management_code ?? null,
      room_id: s.room?.id ?? null,
      room_name: s.room?.name ?? null,
      decision: null,
      average: null,
      assignment_id: null,
    }));
  }

  async getOrCreateThreshold(classId: string, academicYearId: string): Promise<ClassDecisionThreshold> {
    let t = await this.thresholdRepo.findOne({
      where: { class: { id: classId }, academic_year: { id: academicYearId } },
      relations: ['class', 'academic_year'],
    });
    if (!t) {
      t = this.thresholdRepo.create({
        class: { id: classId },
        academic_year: { id: academicYearId },
        min_average_admis: '10',
        min_average_admis_ailleurs: '8',
        min_average_redoubler: '6',
        min_average_ajourne: '4',
      });
      t = await this.thresholdRepo.save(t);
    }
    return t;
  }

  async saveThreshold(
    classId: string,
    academicYearId: string,
    thresholds: {
      min_average_admis: number;
      min_average_admis_ailleurs: number;
      min_average_redoubler: number;
      min_average_ajourne: number;
    },
  ): Promise<ClassDecisionThreshold> {
    const t = await this.getOrCreateThreshold(classId, academicYearId);
    t.min_average_admis = String(thresholds.min_average_admis);
    t.min_average_admis_ailleurs = String(thresholds.min_average_admis_ailleurs);
    t.min_average_redoubler = String(thresholds.min_average_redoubler);
    t.min_average_ajourne = String(thresholds.min_average_ajourne);
    return this.thresholdRepo.save(t);
  }

  async findAllThresholds(academicYearId?: string, classId?: string): Promise<any[]> {
    const qb = this.thresholdRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.class', 'c')
      .leftJoinAndSelect('t.academic_year', 'ay')
      .orderBy('ay.name', 'DESC')
      .addOrderBy('c.name', 'ASC');
    if (academicYearId) qb.andWhere('t.academic_year_id = :ay', { ay: academicYearId });
    if (classId) qb.andWhere('t.class_id = :cid', { cid: classId });
    const list = await qb.getMany();
    return list.map((t) => ({
      id: t.id,
      class_id: t.class?.id,
      class_name: t.class?.name,
      academic_year_id: t.academic_year?.id,
      academic_year_name: t.academic_year?.name,
      min_average_admis: Number(t.min_average_admis),
      min_average_admis_ailleurs: Number(t.min_average_admis_ailleurs),
      min_average_redoubler: Number(t.min_average_redoubler),
      min_average_ajourne: Number(t.min_average_ajourne),
    }));
  }

  /**
   * Logique Haïti : points avec coefficients (100, 200, 300, 400, 500…).
   * Par période : moyenne période = (points obtenus / points possibles) * 10.
   * Moyenne générale = moyenne des moyennes des périodes (sur 10).
   */
  async computeStudentAverage(studentId: string, academicYearId: string, classId: string): Promise<number | null> {
    const grades = await this.gradeRepo.find({
      where: {
        student: { id: studentId },
        academic_year: { id: academicYearId },
        class: { id: classId },
      },
      relations: ['subject', 'period'],
    });
    if (grades.length === 0) return null;
    const coefRows = await this.coefRepo.find({
      where: { academic_year: { id: academicYearId }, class: { id: classId } },
      relations: ['subject'],
    });
    const classBaremeBySubject = new Map<string, number>();
    for (const c of coefRows) {
      const sid = c.subject?.id ?? (c as { subject_id?: string }).subject_id;
      if (sid) classBaremeBySubject.set(sid, Number(c.coefficient));
    }
    const byPeriod = new Map<string, { obtained: number; possible: number }>();
    for (const g of grades) {
      const pid = g.period?.id ?? (g as { period_id?: string }).period_id;
      if (!pid) continue;
      const subId = g.subject?.id ?? (g as { subject_id?: string }).subject_id;
      const points = Number(g.grade_value) || 0;
      const bareme = resolveBareme({
        gradeCoefficient: Number(g.coefficient),
        classCoefficient: subId ? classBaremeBySubject.get(subId) ?? null : null,
        points,
      });
      const cur = byPeriod.get(pid) ?? { obtained: 0, possible: 0 };
      cur.obtained += points;
      cur.possible += bareme;
      byPeriod.set(pid, cur);
    }
    const periodAverages: number[] = [];
    for (const { obtained, possible } of byPeriod.values()) {
      if (possible > 0) {
        periodAverages.push((obtained / possible) * 10);
      }
    }
    if (periodAverages.length === 0) return null;
    const general = periodAverages.reduce((a, b) => a + b, 0) / periodAverages.length;
    return Math.round(general * 100) / 100;
  }

  async hasExpelledMeasure(studentId: string): Promise<boolean> {
    const m = await this.measureRepo.findOne({
      where: { student: { id: studentId }, measure_type: 'RENVOYE_DEFINITIVEMENT' },
    });
    return !!m;
  }

  async computeAndSetDecisions(academicYearId: string, classId: string): Promise<{ updated: number }> {
    const cls = await this.classRepo.findOne({
      where: { id: classId },
      select: ['id', 'description', 'level'],
    });
    if (cls && isPreschoolClass(cls.description, cls.level)) {
      return { updated: 0 };
    }

    const threshold = await this.getOrCreateThreshold(classId, academicYearId);
    const minAdmis = Number(threshold.min_average_admis);
    const minAdmisAilleurs = Number(threshold.min_average_admis_ailleurs);
    const minRedoubler = Number(threshold.min_average_redoubler);
    const minAjourne = Number(threshold.min_average_ajourne);

    const assignments = await this.assignmentRepo.find({
      where: { academic_year: { id: academicYearId }, class: { id: classId } },
      relations: ['student'],
    });

    let updated = 0;
    for (const a of assignments) {
      const sid = a.student?.id;
      if (!sid) continue;

      const expelled = await this.hasExpelledMeasure(sid);
      if (expelled) {
        a.decision = DECISION_EXPELLED;
        a.average = a.average;
        await this.assignmentRepo.save(a);
        updated++;
        continue;
      }

      const avg = await this.computeStudentAverage(sid, academicYearId, classId);
      a.average = avg != null ? String(avg) : null;

      if (avg == null) {
        a.decision = null;
      } else if (avg >= minAdmis) {
        a.decision = DECISION_ADMIS;
      } else if (avg >= minAdmisAilleurs) {
        a.decision = DECISION_ADMIS_AILLEURS;
      } else if (avg >= minRedoubler) {
        a.decision = DECISION_REDOUBLER;
      } else if (avg >= minAjourne) {
        a.decision = DECISION_AJOURNE;
      } else {
        a.decision = DECISION_RENVOYE_DEFINITIVEMENT;
      }
      await this.assignmentRepo.save(a);
      updated++;
    }
    return { updated };
  }

  async setDecision(assignmentId: string, decision: string): Promise<StudentClassAssignment> {
    const a = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
      relations: ['student', 'class', 'academic_year'],
    });
    if (!a) throw new NotFoundException('Assignment not found');
    a.decision = decision;
    return this.assignmentRepo.save(a);
  }

  async ensureAssignmentsFromCurrentStudents(academicYearId: string): Promise<{ created: number }> {
    const students = await this.studentRepo.find({
      where: { active: true },
      relations: ['class'],
    });
    const currentYearId =
      (await this.schoolProfileRepo.find({ take: 1 }))[0]
        ?.current_academic_year_id ?? null;

    let created = 0;
    for (const s of students) {
      if (!s.class?.id || s.archived_at) continue;
      const existing = await this.assignmentRepo.findOne({
        where: { student: { id: s.id }, academic_year: { id: academicYearId } },
        relations: ['class'],
      });
      if (existing) {
        if (
          currentYearId &&
          academicYearId === currentYearId &&
          existing.class?.id !== s.class.id
        ) {
          existing.class = { id: s.class.id } as Class;
          await this.assignmentRepo.save(existing);
        }
        continue;
      }

      const a = this.assignmentRepo.create({
        student: { id: s.id },
        academic_year: { id: academicYearId },
        class: { id: s.class.id },
        decision: null,
        average: null,
      });
      await this.assignmentRepo.save(a);
      created++;
    }
    return { created };
  }

  async runFormationForNextYear(
    currentYearId: string,
    nextYearId: string,
  ): Promise<{ created: number; promoted: number; skipped: number; graduated: number }> {
    const currentYear = await this.academicYearRepo.findOne({ where: { id: currentYearId } });
    const nextYear = await this.academicYearRepo.findOne({ where: { id: nextYearId } });
    if (!currentYear || !nextYear) throw new BadRequestException('Année académique introuvable');

    const classes = await this.classRepo.find({ order: { name: 'ASC' } });
    const rooms = await this.roomRepo.find({ relations: ['class'] });

    let created = 0;
    let promoted = 0;
    let skipped = 0;
    let graduated = 0;

    const expelled = new Set([
      DECISION_RENVOYE_DEFINITIVEMENT,
      DECISION_EXPELLED,
      'RENVOYE',
    ]);

    const assignments = await this.assignmentRepo.find({
      where: { academic_year: { id: currentYearId } },
      relations: ['student', 'student.room', 'class', 'academic_year'],
    });

    for (const a of assignments) {
      const student = a.student;
      const sid = student?.id;
      if (!sid) continue;
      if (student.active === false || student.archived_at) continue;

      if (a.decision && expelled.has(a.decision)) {
        await this.markStudentAlumni(sid, 'REMOVED');
        skipped++;
        continue;
      }

      const existingNext = await this.assignmentRepo.findOne({
        where: { student: { id: sid }, academic_year: { id: nextYearId } },
      });
      if (existingNext) continue;

      const promotes = [DECISION_ADMIS, DECISION_ADMIS_AILLEURS];
      let nextClass = a.class;
      if (a.decision && promotes.includes(a.decision)) {
        const found = this.findNextLevelClass(a.class, classes);
        if (!found && this.isGraduationClass(a.class, classes)) {
          await this.markStudentAlumni(sid, 'GRADUATED');
          graduated++;
          continue;
        }
        nextClass = found ?? a.class;
        promoted++;
      }
      const nextClassId = nextClass?.id;
      if (!nextClassId) continue;

      const nextA = this.assignmentRepo.create({
        student: { id: sid },
        academic_year: { id: nextYearId },
        class: { id: nextClassId },
        decision: null,
        average: null,
      });
      await this.assignmentRepo.save(nextA);
      created++;

      const nextRoomId = this.matchRoomInClass(
        student.room?.name,
        nextClassId,
        rooms,
      );
      const st = await this.studentRepo.findOne({ where: { id: sid } });
      if (st) {
        st.class = { id: nextClassId } as Class;
        st.room = nextRoomId ? ({ id: nextRoomId } as Room) : null;
        await this.studentRepo.save(st);
      }
    }

    return { created, promoted, skipped, graduated };
  }

  /**
   * Lance l’année suivante : décisions, année, périodes, horaires (mêmes profs),
   * formation des classes selon les moyennes.
   */
  async launchNextYear(currentYearId: string): Promise<{
    next_year: { id: string; name: string };
    decisions_updated: number;
    periods_copied: number;
    slots_copied: number;
    moments_copied: number;
    duties_copied: number;
    created: number;
    promoted: number;
    skipped: number;
    graduated: number;
  }> {
    const currentYear = await this.academicYearRepo.findOne({
      where: { id: currentYearId },
    });
    if (!currentYear) throw new BadRequestException('Année académique introuvable');

    const classes = await this.classRepo.find();
    let decisionsUpdated = 0;
    for (const cls of classes) {
      if (isPreschoolClass(cls.description, cls.level)) continue;
      const result = await this.computeAndSetDecisions(currentYearId, cls.id);
      decisionsUpdated += result.updated ?? 0;
    }

    const nextName = nextAcademicYearName(currentYear.name);
    let nextYear = await this.academicYearRepo.findOne({ where: { name: nextName } });
    if (!nextYear) {
      nextYear = await this.academicYearRepo.save(
        this.academicYearRepo.create({
          name: nextName,
          start_date: addOneCalendarYear(currentYear.start_date) || undefined,
          end_date: addOneCalendarYear(currentYear.end_date) || undefined,
          active: true,
        }),
      );
    }

    const currentPeriods = await this.periodRepo.find({
      where: { academic_year: { id: currentYearId } },
      order: { order_index: 'ASC', name: 'ASC' },
    });
    const existingPeriods = await this.periodRepo.find({
      where: { academic_year: { id: nextYear.id } },
    });
    let periodsCopied = 0;
    if (existingPeriods.length === 0) {
      for (const p of currentPeriods) {
        await this.periodRepo.save(
          this.periodRepo.create({
            academic_year: { id: nextYear.id },
            name: p.name,
            order_index: p.order_index,
            scope: p.scope === 'PRESCOLAIRE' ? 'PRESCOLAIRE' : 'ECOLE',
          }),
        );
        periodsCopied++;
      }
    }

    const currentSlots = await this.scheduleSlotRepo.find({
      where: { academic_year: currentYear.name },
      relations: ['class', 'subject', 'teacher', 'room'],
    });
    const existingSlots = await this.scheduleSlotRepo.find({
      where: { academic_year: nextYear.name },
    });
    let slotsCopied = 0;
    if (existingSlots.length === 0) {
      for (const slot of currentSlots) {
        const classId = slot.class?.id;
        const subjectId = slot.subject?.id;
        const teacherId = slot.teacher?.id;
        const roomId = slot.room?.id;
        if (!classId || !subjectId || !teacherId || !roomId) continue;
        await this.scheduleSlotRepo.save(
          this.scheduleSlotRepo.create({
            academic_year: nextYear.name,
            class: { id: classId },
            subject: { id: subjectId },
            teacher: { id: teacherId },
            room: { id: roomId },
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
          }),
        );
        slotsCopied++;
      }
    }

    const currentMoments = await this.classDayMomentRepo.find({
      where: { academic_year: currentYear.name },
      relations: ['class'],
    });
    const existingMoments = await this.classDayMomentRepo.find({
      where: { academic_year: nextYear.name },
    });
    let momentsCopied = 0;
    if (existingMoments.length === 0) {
      for (const m of currentMoments) {
        const classId = m.class?.id ?? m.class_id;
        if (!classId) continue;
        await this.classDayMomentRepo.save(
          this.classDayMomentRepo.create({
            academic_year: nextYear.name,
            class: { id: classId },
            class_id: classId,
            kind: m.kind,
            day_of_week: m.day_of_week,
            start_time: m.start_time,
            end_time: m.end_time,
            label: m.label,
          }),
        );
        momentsCopied++;
      }
    }

    const currentDuties = await this.schoolWeekDutyRepo.find({
      where: { academic_year: currentYear.name },
    });
    const existingDuties = await this.schoolWeekDutyRepo.find({
      where: { academic_year: nextYear.name },
    });
    let dutiesCopied = 0;
    if (existingDuties.length === 0) {
      for (const d of currentDuties) {
        await this.schoolWeekDutyRepo.save(
          this.schoolWeekDutyRepo.create({
            academic_year: nextYear.name,
            kind: d.kind,
            cycle: d.cycle ?? null,
            class_id: d.class_id ?? null,
            day_of_week: d.day_of_week,
            start_time: d.start_time,
            end_time: d.end_time,
            responsible_user_id: d.responsible_user_id,
          }),
        );
        dutiesCopied++;
      }
    }

    const currentThresholds = await this.thresholdRepo.find({
      where: { academic_year: { id: currentYearId } },
      relations: ['class'],
    });
    for (const t of currentThresholds) {
      const classId = t.class?.id;
      if (!classId) continue;
      const exists = await this.thresholdRepo.findOne({
        where: { class: { id: classId }, academic_year: { id: nextYear.id } },
      });
      if (exists) continue;
      await this.thresholdRepo.save(
        this.thresholdRepo.create({
          class: { id: classId },
          academic_year: { id: nextYear.id },
          min_average_admis: t.min_average_admis,
          min_average_admis_ailleurs: t.min_average_admis_ailleurs,
          min_average_redoubler: t.min_average_redoubler,
          min_average_ajourne: t.min_average_ajourne,
        }),
      );
    }

    const formation = await this.runFormationForNextYear(currentYearId, nextYear.id);

    const nextPeriods = await this.periodRepo.find({
      where: { academic_year: { id: nextYear.id } },
      order: { order_index: 'ASC' },
    });
    const profile = await this.schoolProfileRepo.find({ take: 1 });
    if (profile[0]) {
      profile[0].current_academic_year_id = nextYear.id;
      const schoolPeriod =
        nextPeriods.find((p) => (p.scope || 'ECOLE') !== 'PRESCOLAIRE') ?? nextPeriods[0];
      const preschoolPeriod = nextPeriods.find((p) => p.scope === 'PRESCOLAIRE');
      profile[0].current_period_id = schoolPeriod?.id ?? profile[0].current_period_id;
      profile[0].current_preschool_period_id =
        preschoolPeriod?.id ?? profile[0].current_preschool_period_id;
      await this.schoolProfileRepo.save(profile[0]);
    }

    return {
      next_year: { id: nextYear.id, name: nextYear.name },
      decisions_updated: decisionsUpdated,
      periods_copied: periodsCopied,
      slots_copied: slotsCopied,
      moments_copied: momentsCopied,
      duties_copied: dutiesCopied,
      created: formation.created,
      promoted: formation.promoted,
      skipped: formation.skipped,
      graduated: formation.graduated,
    };
  }

  /**
   * Dernière classe du secondaire / supérieur : Philo, Terminale, NS4,
   * ou plus haut numéro du cycle s’il n’existe pas de classe suivante.
   */
  private isGraduationClass(current: Class | undefined, classes: Class[]): boolean {
    if (!current) return false;
    const level = (current.level ?? '').toUpperCase();
    if (level !== 'SECONDAIRE' && level !== 'FORMATION_SUPERIEURE') return false;
    const same = classes.filter((c) => (c.level ?? '').toUpperCase() === level);
    if (this.findNextLevelClass(current, same)) return false;
    const name = current.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
    if (/(^|[^a-z])philo|terminale|ns[\s-]*4/.test(name)) return true;
    const compact = current.name.replace(/\s+/g, '');
    const match = compact.match(/^(\d+)/);
    if (!match) return false;
    const n = parseInt(match[1], 10);
    const hasHigher = same.some((c) => {
      const m = c.name.replace(/\s+/g, '').match(/^(\d+)/);
      return !!m && parseInt(m[1], 10) > n;
    });
    return !hasHigher;
  }

  private async markStudentAlumni(
    studentId: string,
    reason: 'REMOVED' | 'GRADUATED',
  ): Promise<void> {
    const st = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!st || st.archived_at) return;
    st.active = false;
    st.archived_at = new Date();
    st.archive_reason = reason;
    st.room = null;
    await this.studentRepo.save(st);
  }

  private findNextLevelClass(current: Class, classes: Class[]): Class | null {
    const name = (current?.name ?? '').trim();
    if (!name) return null;
    const compact = name.replace(/\s+/g, '');
    const match = compact.match(/^(\d+)(.*)$/);
    if (!match) return null;
    const nextCompact = `${parseInt(match[1], 10) + 1}${match[2]}`;
    return (
      classes.find((c) => c.name.replace(/\s+/g, '') === nextCompact) ??
      classes.find((c) => c.name === `${parseInt(match[1], 10) + 1}${match[2]}`) ??
      null
    );
  }

  private matchRoomInClass(
    currentRoomName: string | undefined,
    nextClassId: string,
    rooms: Room[],
  ): string | null {
    const inClass = rooms.filter(
      (r) => (r.class?.id ?? (r as any).class_id) === nextClassId && r.active !== false,
    );
    if (currentRoomName) {
      const sameName = inClass.find((r) => r.name === currentRoomName);
      if (sameName) return sameName.id;
    }
    return inClass[0]?.id ?? null;
  }

  async moveStudentToClass(
    studentId: string,
    academicYearId: string,
    classId: string,
  ): Promise<{ student_id: string; class_id: string }> {
    if (!studentId?.trim() || !academicYearId?.trim() || !classId?.trim()) {
      throw new BadRequestException('student_id, academic_year_id et class_id requis');
    }
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class', 'room', 'room.class'],
    });
    if (!student) throw new NotFoundException('Élève introuvable');
    const targetClass = await this.classRepo.findOne({ where: { id: classId } });
    if (!targetClass) throw new NotFoundException('Classe introuvable');
    const year = await this.academicYearRepo.findOne({ where: { id: academicYearId } });
    if (!year) throw new NotFoundException('Année académique introuvable');

    const existing = await this.assignmentRepo.findOne({
      where: { student: { id: studentId }, academic_year: { id: academicYearId } },
      relations: ['class'],
    });
    if (existing) {
      if (existing.class?.id !== classId) {
        existing.class = { id: classId } as Class;
        await this.assignmentRepo.save(existing);
      }
    } else {
      const destCount = await this.assignmentRepo.count({
        where: { academic_year: { id: academicYearId }, class: { id: classId } },
      });
      if (destCount > 0) {
        await this.assignmentRepo.save(
          this.assignmentRepo.create({
            student: { id: studentId },
            academic_year: { id: academicYearId },
            class: { id: classId },
            decision: null,
            average: null,
          }),
        );
      }
    }

    student.class = { id: classId } as Class;
    const roomClassId = student.room?.class?.id ?? null;
    if (!student.room || (roomClassId && roomClassId !== classId)) {
      student.room = null;
    }
    await this.studentRepo.save(student);
    await this.alignStudentCurrentYear(student.id);
    return { student_id: student.id, class_id: classId };
  }

  async addStudentToClass(studentId: string, academicYearId: string, classId: string): Promise<StudentClassAssignment> {
    const existing = await this.assignmentRepo.findOne({
      where: { student: { id: studentId }, academic_year: { id: academicYearId } },
    });
    if (existing) {
      existing.class = { id: classId } as Class;
      return this.assignmentRepo.save(existing);
    }
    const a = this.assignmentRepo.create({
      student: { id: studentId },
      academic_year: { id: academicYearId },
      class: { id: classId },
      decision: null,
      average: null,
    });
    return this.assignmentRepo.save(a);
  }

  async removeStudentFromClass(assignmentId: string): Promise<void> {
    const a = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    await this.assignmentRepo.remove(a);
  }
}

function nextAcademicYearName(name: string): string {
  const range = name.match(/(\d{4})\s*[-–/]\s*(\d{4})/);
  if (range) {
    const a = Number.parseInt(range[1], 10);
    const b = Number.parseInt(range[2], 10);
    return name.replace(range[0], `${a + 1}-${b + 1}`);
  }
  const year = name.match(/(\d{4})/);
  if (year) {
    return name.replace(year[1], String(Number.parseInt(year[1], 10) + 1));
  }
  return `${name.trim()} (suivant)`;
}

function addOneCalendarYear(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setFullYear(d.getFullYear() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
