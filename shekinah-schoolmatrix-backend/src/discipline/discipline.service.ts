import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from './attendance.entity';
import { Lateness } from './lateness.entity';
import { DisciplinaryDeduction } from './disciplinary-deduction.entity';
import { DisciplinaryMeasure } from './disciplinary-measure.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';

const DISCIPLINARY_BASE_POINTS = 100;

export const MEASURE_LABELS: Record<string, string> = {
  SOUS_SURVEILLANCE: 'Sous-surveillance',
  EN_RETENUE: 'En retenue',
  RENVOYE_TEMPORAIREMENT: 'Renvoyé temporairement',
  RENVOYE_DEFINITIVEMENT: 'Renvoyé(e) définitivement',
};

export const MEASURE_COLORS: Record<string, string> = {
  SOUS_SURVEILLANCE: '#3b82f6',
  EN_RETENUE: '#f59e0b',
  RENVOYE_TEMPORAIREMENT: '#ef4444',
  RENVOYE_DEFINITIVEMENT: '#991b1b',
};

@Injectable()
export class DisciplineService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Lateness)
    private readonly latenessRepo: Repository<Lateness>,
    @InjectRepository(DisciplinaryDeduction)
    private readonly deductionRepo: Repository<DisciplinaryDeduction>,
    @InjectRepository(DisciplinaryMeasure)
    private readonly measureRepo: Repository<DisciplinaryMeasure>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
  ) {}

  async getAttendanceByClassAndDate(classId: string, date: string): Promise<any> {
    const students = await this.studentRepo.find({
      where: { class: { id: classId } },
      relations: ['class'],
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
    const records = await this.attendanceRepo.find({
      where: { class: { id: classId }, date: new Date(date) },
      relations: ['student', 'class'],
    });
    const byStudent = new Map(records.map((r) => [r.student.id, r.status]));
    return {
      class_id: classId,
      date,
      students: students.map((s) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        status: byStudent.get(s.id) ?? null,
      })),
    };
  }

  async setAttendance(classId: string, date: string, studentId: string, status: string): Promise<any> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId, class: { id: classId } },
    });
    if (!student) throw new NotFoundException('Student not found in this class');
    let rec = await this.attendanceRepo.findOne({
      where: { class: { id: classId }, student: { id: studentId }, date: new Date(date) },
    });
    if (rec) {
      rec.status = status;
      await this.attendanceRepo.save(rec);
    } else {
      rec = this.attendanceRepo.create({
        class: { id: classId },
        student: { id: studentId },
        date: new Date(date),
        status,
      });
      await this.attendanceRepo.save(rec);
    }
    return { ok: true, attendance: { student_id: studentId, date, status } };
  }

  async setBulkAttendance(classId: string, date: string, records: { student_id: string; status: string }[]): Promise<{ ok: boolean }> {
    for (const r of records) {
      await this.setAttendance(classId, date, r.student_id, r.status);
    }
    return { ok: true };
  }

  async createLateness(studentId: string, classId: string, date: string, arrivalTime: string): Promise<any> {
    const student = await this.studentRepo.findOne({ where: { id: studentId }, relations: ['class'] });
    if (!student) throw new NotFoundException('Student not found');
    const rec = this.latenessRepo.create({
      student: { id: studentId },
      class: { id: classId },
      date: new Date(date),
      arrival_time: arrivalTime.trim(),
    });
    const saved = await this.latenessRepo.save(rec);
    return {
      ok: true,
      lateness: {
        id: saved.id,
        student_id: studentId,
        class_id: classId,
        date,
        arrival_time: saved.arrival_time,
        created_at: saved.created_at,
      },
    };
  }

  async listLatenesses(filters?: { student_id?: string; class_id?: string; date?: string }): Promise<any> {
    const qb = this.latenessRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.student', 's')
      .leftJoinAndSelect('l.class', 'c')
      .orderBy('l.date', 'DESC')
      .addOrderBy('l.arrival_time', 'DESC');
    if (filters?.student_id) qb.andWhere('l.student_id = :sid', { sid: filters.student_id });
    if (filters?.class_id) qb.andWhere('l.class_id = :cid', { cid: filters.class_id });
    if (filters?.date) qb.andWhere('l.date = :d', { d: filters.date });
    const list = await qb.getMany();
    return {
      ok: true,
      latenesses: list.map((l) => ({
        id: l.id,
        student_id: l.student?.id,
        student_name: l.student ? `${l.student.first_name} ${l.student.last_name}` : null,
        class_id: l.class?.id,
        class_name: l.class?.name,
        date: l.date,
        arrival_time: l.arrival_time,
        created_at: l.created_at,
      })),
    };
  }

  async deleteLateness(id: string): Promise<{ ok: boolean; deleted: boolean }> {
    const rec = await this.latenessRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException('Lateness not found');
    await this.latenessRepo.remove(rec);
    return { ok: true, deleted: true };
  }

  async addDeduction(studentId: string, pointsDeducted: number, reason?: string): Promise<any> {
    if (pointsDeducted === 0 || pointsDeducted < -100 || pointsDeducted > 100) {
      throw new BadRequestException('points_deducted must be between -100 and 100 (negative = ajouter, positif = retirer)');
    }
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    const rec = this.deductionRepo.create({
      student: { id: studentId },
      points_deducted: pointsDeducted,
      reason: reason?.trim() || undefined,
    });
    const saved = await this.deductionRepo.save(rec);
    const total = await this.getDisciplinaryPoints(studentId);
    return {
      ok: true,
      deduction: {
        id: saved.id,
        student_id: studentId,
        points_deducted: saved.points_deducted,
        reason: saved.reason,
        created_at: saved.created_at,
      },
      current_points: total,
    };
  }

  async getDisciplinaryPoints(studentId: string): Promise<number> {
    const result = await this.deductionRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.points_deducted), 0)', 'sum')
      .where('d.student_id = :id', { id: studentId })
      .getRawOne();
    const netDeducted = parseInt(result?.sum ?? '0', 10);
    return Math.min(100, Math.max(0, DISCIPLINARY_BASE_POINTS - netDeducted));
  }

  async listDeductions(studentId?: string): Promise<any> {
    const qb = this.deductionRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.student', 's')
      .orderBy('d.created_at', 'DESC');
    if (studentId) qb.andWhere('d.student_id = :sid', { sid: studentId });
    const list = await qb.getMany();
    return {
      ok: true,
      deductions: list.map((d) => ({
        id: d.id,
        student_id: d.student?.id,
        student_name: d.student ? `${d.student.first_name} ${d.student.last_name}` : null,
        points_deducted: d.points_deducted,
        reason: d.reason,
        created_at: d.created_at,
      })),
    };
  }

  async deleteDeduction(id: string): Promise<{ ok: boolean; deleted: boolean }> {
    const rec = await this.deductionRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException('Deduction not found');
    await this.deductionRepo.remove(rec);
    return { ok: true, deleted: true };
  }

  async addMeasure(
    studentId: string,
    measureType: string,
    reason?: string,
    durationDays?: number,
  ): Promise<any> {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    if (measureType === 'RENVOYE_TEMPORAIREMENT') {
      const days = durationDays ?? 1;
      if (days < 1 || days > 365) {
        throw new BadRequestException('duration_days doit être entre 1 et 365 pour un renvoi temporaire.');
      }
    }
    const rec = this.measureRepo.create({
      student: { id: studentId },
      measure_type: measureType,
      reason: reason?.trim() || undefined,
    });
    const saved = await this.measureRepo.save(rec);
    if (measureType === 'RENVOYE_TEMPORAIREMENT') {
      const days = durationDays ?? 1;
      const expiresAt = new Date(saved.created_at.getTime());
      expiresAt.setDate(expiresAt.getDate() + days);
      saved.expires_at = expiresAt;
      await this.measureRepo.save(saved);
    }
    return {
      ok: true,
      measure: {
        id: saved.id,
        student_id: studentId,
        measure_type: saved.measure_type,
        label: MEASURE_LABELS[saved.measure_type],
        color: MEASURE_COLORS[saved.measure_type],
        reason: saved.reason,
        created_at: saved.created_at,
        expires_at: saved.expires_at ?? undefined,
      },
    };
  }

  async deleteMeasure(id: string): Promise<{ ok: boolean; deleted: boolean }> {
    const rec = await this.measureRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException('Measure not found');
    await this.measureRepo.remove(rec);
    return { ok: true, deleted: true };
  }

  async updateMeasure(
    id: string,
    payload: { reason?: string; duration_days?: number },
  ): Promise<any> {
    const rec = await this.measureRepo.findOne({ where: { id }, relations: ['student'] });
    if (!rec) throw new NotFoundException('Measure not found');
    if (payload.reason !== undefined) rec.reason = payload.reason?.trim() || null;
    if (rec.measure_type === 'RENVOYE_TEMPORAIREMENT' && payload.duration_days != null) {
      if (payload.duration_days < 1 || payload.duration_days > 365) {
        throw new BadRequestException('duration_days doit être entre 1 et 365.');
      }
      const from = rec.created_at ?? new Date();
      const expiresAt = new Date(from.getTime());
      expiresAt.setDate(expiresAt.getDate() + payload.duration_days);
      rec.expires_at = expiresAt;
    }
    const saved = await this.measureRepo.save(rec);
    const studentId = saved.student?.id ?? (saved as any).student_id;
    return {
      ok: true,
      measure: {
        id: saved.id,
        student_id: studentId,
        measure_type: saved.measure_type,
        label: MEASURE_LABELS[saved.measure_type],
        color: MEASURE_COLORS[saved.measure_type],
        reason: saved.reason,
        created_at: saved.created_at,
        expires_at: saved.expires_at ?? undefined,
      },
    };
  }

  /** La mesure "En retenue" est temporaire : elle disparaît après 10 heures. */
  private static readonly RETENUE_HOURS = 10;

  /** Compare uniquement la date (jour), pas l'heure : expiré dès que le jour d'échéance est atteint. */
  private static isDateReachedOrPast(now: Date, expiry: Date): boolean {
    const n = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const e = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
    return n >= e;
  }

  async listMeasures(studentId?: string): Promise<any> {
    const qb = this.measureRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.student', 's')
      .orderBy('m.created_at', 'DESC');
    if (studentId) qb.andWhere('m.student_id = :sid', { sid: studentId });
    const list = await qb.getMany();
    const now = new Date();
    const retenueExpiryMs = DisciplineService.RETENUE_HOURS * 60 * 60 * 1000;
    const filtered = list.filter((m) => {
      if (m.measure_type === 'EN_RETENUE') {
        const age = now.getTime() - (m.created_at?.getTime() ?? 0);
        return age < retenueExpiryMs;
      }
      if (m.measure_type === 'RENVOYE_TEMPORAIREMENT' && m.expires_at) {
        return !DisciplineService.isDateReachedOrPast(now, m.expires_at);
      }
      return true;
    });
    return {
      ok: true,
      measures: filtered.map((m) => ({
        id: m.id,
        student_id: m.student?.id,
        student_name: m.student ? `${m.student.first_name} ${m.student.last_name}` : null,
        measure_type: m.measure_type,
        label: MEASURE_LABELS[m.measure_type],
        color: MEASURE_COLORS[m.measure_type],
        reason: m.reason,
        created_at: m.created_at,
        expires_at: m.expires_at ?? undefined,
      })),
    };
  }

  async getStudentDisciplineSummary(studentId: string): Promise<any> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class'],
    });
    if (!student) throw new NotFoundException('Student not found');
    const [points, latenessCount, absenceCount, latestMeasure, deductions] = await Promise.all([
      this.getDisciplinaryPoints(studentId),
      this.latenessRepo.count({ where: { student: { id: studentId } } }),
      this.attendanceRepo.count({ where: { student: { id: studentId }, status: 'ABSENT' } }),
      this.measureRepo.findOne({
        where: { student: { id: studentId } },
        order: { created_at: 'DESC' },
      }),
      this.deductionRepo.find({
        where: { student: { id: studentId } },
        order: { created_at: 'ASC' },
      }),
    ]);
    const now = new Date();
    const retenueExpiryMs = DisciplineService.RETENUE_HOURS * 60 * 60 * 1000;
    const isRetenueExpired = (m: any) =>
      m?.measure_type === 'EN_RETENUE' &&
      m?.created_at &&
      (now.getTime() - m.created_at.getTime()) >= retenueExpiryMs;
    const isRenvoiExpired = (m: any) =>
      m?.measure_type === 'RENVOYE_TEMPORAIREMENT' &&
      m?.expires_at &&
      DisciplineService.isDateReachedOrPast(now, m.expires_at);
    const latestMeasureData =
      latestMeasure &&
      !isRetenueExpired(latestMeasure) &&
      !isRenvoiExpired(latestMeasure)
        ? {
            id: latestMeasure.id,
            measure_type: latestMeasure.measure_type,
            label: MEASURE_LABELS[latestMeasure.measure_type],
            color: MEASURE_COLORS[latestMeasure.measure_type],
            reason: latestMeasure.reason,
            created_at: latestMeasure.created_at,
            expires_at: latestMeasure.expires_at ?? undefined,
          }
        : null;
    let cumulative = DISCIPLINARY_BASE_POINTS;
    const points_history: { date: string | null; points: number }[] = [{ date: null, points: cumulative }];
    for (const d of deductions) {
      cumulative = Math.min(100, Math.max(0, cumulative - d.points_deducted));
      points_history.push({
        date: d.created_at.toISOString().slice(0, 10),
        points: cumulative,
      });
    }
    return {
      ok: true,
      student_id: studentId,
      student_name: `${student.first_name} ${student.last_name}`,
      class_name: student.class?.name,
      disciplinary_points: points,
      lateness_count: latenessCount,
      absence_count: absenceCount,
      latest_measure: latestMeasureData,
      points_history,
    };
  }
}
