import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeService } from './fee-service.entity';
import { ClassFee } from './class-fee.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { StudentServiceExemption } from './student-service-exemption.entity';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';

export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

@Injectable()
export class EconomatService {
  constructor(
    @InjectRepository(FeeService)
    private readonly feeServiceRepo: Repository<FeeService>,
    @InjectRepository(ClassFee)
    private readonly classFeeRepo: Repository<ClassFee>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(StudentServiceExemption)
    private readonly exemptionRepo: Repository<StudentServiceExemption>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
  ) {}

  getCurrentAcademicYear(): string {
    return getCurrentAcademicYear();
  }

  async findAllFeeServices(): Promise<FeeService[]> {
    return this.feeServiceRepo.find({ order: { name: 'ASC' } });
  }

  async createFeeService(params: { name: string; code?: string; nature?: string }): Promise<FeeService> {
    const nature = params.nature === 'PARASCOLAIRE' ? 'PARASCOLAIRE' : 'OBLIGATOIRE';
    const s = this.feeServiceRepo.create({
      name: params.name.trim(),
      code: params.code?.trim(),
      active: true,
      nature,
    });
    return this.feeServiceRepo.save(s);
  }

  async updateFeeService(id: string, params: Partial<{ name: string; code: string; active: boolean; nature: string }>): Promise<FeeService> {
    const s = await this.feeServiceRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Fee service not found');
    if (params.name !== undefined) s.name = params.name.trim();
    if (params.code !== undefined) s.code = params.code?.trim() || undefined;
    if (params.active !== undefined) s.active = params.active;
    if (params.nature !== undefined) s.nature = params.nature === 'PARASCOLAIRE' ? 'PARASCOLAIRE' : 'OBLIGATOIRE';
    return this.feeServiceRepo.save(s);
  }

  async deleteFeeService(id: string): Promise<{ deleted: boolean }> {
    const s = await this.feeServiceRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Fee service not found');
    await this.feeServiceRepo.remove(s);
    return { deleted: true };
  }

  async findAllClassFees(filters: { academic_year?: string; class_id?: string }): Promise<any[]> {
    const qb = this.classFeeRepo
      .createQueryBuilder('cf')
      .leftJoinAndSelect('cf.class', 'class')
      .leftJoinAndSelect('cf.service', 'service')
      .orderBy('cf.academic_year', 'DESC')
      .addOrderBy('class.name', 'ASC')
      .addOrderBy('service.name', 'ASC');
    if (filters.academic_year) qb.andWhere('cf.academic_year = :y', { y: filters.academic_year });
    if (filters.class_id) qb.andWhere('cf.class_id = :c', { c: filters.class_id });
    const list = await qb.getMany();
    return list.map((cf) => ({
      id: cf.id,
      academic_year: cf.academic_year,
      class_id: cf.class?.id,
      class_name: cf.class?.name,
      service_id: cf.service?.id,
      service_name: cf.service?.name,
      amount: Number(cf.amount),
      due_date: cf.due_date ? (typeof cf.due_date === 'string' ? cf.due_date : (cf.due_date as Date).toISOString().slice(0, 10)) : null,
      detail: cf.detail,
      created_at: cf.created_at,
    }));
  }

  async createClassFee(params: { academic_year: string; class_id: string; service_id: string; amount: number; due_date?: string | null; detail?: string }): Promise<ClassFee> {
    const existing = await this.classFeeRepo.findOne({
      where: {
        academic_year: params.academic_year,
        class: { id: params.class_id },
        service: { id: params.service_id },
      },
    });
    if (existing) throw new BadRequestException('Un montant existe déjà pour cette classe, année et service.');
    const cf = this.classFeeRepo.create({
      academic_year: params.academic_year.trim(),
      class: { id: params.class_id },
      service: { id: params.service_id },
      amount: String(params.amount),
      due_date: params.due_date ? new Date(params.due_date) : null,
      detail: params.detail?.trim(),
    });
    return this.classFeeRepo.save(cf);
  }

  async updateClassFee(id: string, params: Partial<{ amount: number; due_date: string | null; detail: string }>): Promise<ClassFee> {
    const cf = await this.classFeeRepo.findOne({ where: { id }, relations: ['class', 'service'] });
    if (!cf) throw new NotFoundException('Class fee not found');
    if (params.amount !== undefined) cf.amount = String(params.amount);
    if (params.due_date !== undefined) cf.due_date = params.due_date ? new Date(params.due_date) : null;
    if (params.detail !== undefined) cf.detail = params.detail?.trim() || undefined;
    return this.classFeeRepo.save(cf);
  }

  async deleteClassFee(id: string): Promise<{ deleted: boolean }> {
    const cf = await this.classFeeRepo.findOne({ where: { id } });
    if (!cf) throw new NotFoundException('Class fee not found');
    await this.classFeeRepo.remove(cf);
    return { deleted: true };
  }

  async getAmountDueForStudent(studentId: string, academicYear: string, serviceId: string): Promise<number> {
    const student = await this.studentRepo.findOne({ where: { id: studentId }, relations: ['class'] });
    if (!student) throw new NotFoundException('Student not found');
    const classFee = await this.classFeeRepo.findOne({
      where: {
        academic_year: academicYear,
        class: { id: student.class.id },
        service: { id: serviceId },
      },
      relations: ['service'],
    });
    if (!classFee) return 0;
    const baseAmount = Number(classFee.amount);
    const exemption = await this.exemptionRepo.findOne({
      where: {
        student: { id: studentId },
        academic_year: academicYear,
        service: { id: serviceId },
      },
    });
    if (!exemption) return baseAmount;
    if (exemption.exemption_type === 'FULL') return 0;
    if (exemption.exemption_type === 'HALF') return Math.round(baseAmount * 50) / 100;
    return baseAmount;
  }

  async getTotalPaidForStudent(studentId: string, academicYear: string, serviceId: string): Promise<number> {
    const result = await this.transactionRepo
      .createQueryBuilder('t')
      .select('SUM(t.amount_paid)', 'total')
      .where('t.student_id = :studentId', { studentId })
      .andWhere('t.academic_year = :academicYear', { academicYear })
      .andWhere('t.service_id = :serviceId', { serviceId })
      .getRawOne();
    return Number(result?.total ?? 0);
  }

  async getBalance(studentId: string, academicYear: string, serviceId: string): Promise<{ amount_due: number; total_paid: number; balance: number }> {
    const amount_due = await this.getAmountDueForStudent(studentId, academicYear, serviceId);
    const total_paid = await this.getTotalPaidForStudent(studentId, academicYear, serviceId);
    return { amount_due, total_paid, balance: Math.round((amount_due - total_paid) * 100) / 100 };
  }

  async recordPayment(params: {
    student_id: string;
    class_id: string;
    academic_year: string;
    service_id: string;
    amount_paid: number;
    payment_date: string;
    bank_account_id?: string | null;
  }): Promise<PaymentTransaction> {
    const student = await this.studentRepo.findOne({ where: { id: params.student_id }, relations: ['class'] });
    if (!student) throw new NotFoundException('Student not found');
    const amount_due = await this.getAmountDueForStudent(params.student_id, params.academic_year, params.service_id);
    if (params.amount_paid <= 0) throw new BadRequestException('Le montant payé doit être strictement positif.');
    const tx = this.transactionRepo.create({
      student: { id: params.student_id } as import('../students/student.entity').Student,
      class: { id: params.class_id } as import('../classes/class.entity').Class,
      academic_year: params.academic_year,
      service: { id: params.service_id } as import('./fee-service.entity').FeeService,
      amount_due: String(amount_due),
      amount_paid: String(params.amount_paid),
      payment_date: new Date(params.payment_date),
      bank_account_id: params.bank_account_id || null,
    });
    return this.transactionRepo.save(tx);
  }

  async findTransactions(filters: { student_id?: string; academic_year?: string; class_id?: string }): Promise<any[]> {
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.student', 'student')
      .leftJoinAndSelect('t.class', 'class')
      .leftJoinAndSelect('t.service', 'service')
      .orderBy('t.payment_date', 'DESC')
      .addOrderBy('t.created_at', 'DESC');
    if (filters.student_id) qb.andWhere('t.student_id = :sid', { sid: filters.student_id });
    if (filters.academic_year) qb.andWhere('t.academic_year = :y', { y: filters.academic_year });
    if (filters.class_id) qb.andWhere('t.class_id = :c', { c: filters.class_id });
    const list = await qb.getMany();
    return list.map((t) => ({
      id: t.id,
      student_id: t.student?.id,
      student_name: t.student ? `${t.student.first_name} ${t.student.last_name}` : null,
      class_id: t.class?.id,
      class_name: t.class?.name,
      academic_year: t.academic_year,
      service_id: t.service?.id,
      service_name: t.service?.name,
      amount_due: Number(t.amount_due),
      amount_paid: Number(t.amount_paid),
      payment_date: t.payment_date,
      bank_account_id: t.bank_account_id ?? null,
      created_at: t.created_at,
    }));
  }

  async getStudentPaymentStatus(studentId: string, academicYear?: string): Promise<any> {
    const student = await this.studentRepo.findOne({ where: { id: studentId }, relations: ['class'] });
    if (!student) throw new NotFoundException('Student not found');
    const year = academicYear || getCurrentAcademicYear();
    const classFees = await this.classFeeRepo.find({
      where: { academic_year: year, class: { id: student.class.id } },
      relations: ['service'],
    });
    const result: any[] = [];
    for (const cf of classFees) {
      const amount_due = await this.getAmountDueForStudent(studentId, year, cf.service.id);
      const total_paid = await this.getTotalPaidForStudent(studentId, year, cf.service.id);
      const dueDateStr = cf.due_date ? (typeof cf.due_date === 'string' ? cf.due_date : (cf.due_date as Date).toISOString().slice(0, 10)) : null;
      result.push({
        service_id: cf.service.id,
        service_name: cf.service.name,
        payment_modality: cf.detail?.trim() || undefined,
        due_date: dueDateStr,
        amount_due,
        total_paid,
        balance: Math.round((amount_due - total_paid) * 100) / 100,
      });
    }
    const transactions = await this.findTransactions({ student_id: studentId, academic_year: year });
    return { academic_year: year, by_service: result, transactions };
  }

  async findExemptions(filters: { student_id?: string; academic_year?: string }): Promise<any[]> {
    const qb = this.exemptionRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.student', 'student')
      .leftJoinAndSelect('e.service', 'service')
      .orderBy('e.academic_year', 'DESC')
      .addOrderBy('service.name', 'ASC');
    if (filters.student_id) qb.andWhere('e.student_id = :sid', { sid: filters.student_id });
    if (filters.academic_year) qb.andWhere('e.academic_year = :y', { y: filters.academic_year });
    const list = await qb.getMany();
    return list.map((e) => ({
      id: e.id,
      student_id: e.student?.id,
      student_name: e.student ? `${e.student.first_name} ${e.student.last_name}` : null,
      academic_year: e.academic_year,
      service_id: e.service?.id,
      service_name: e.service?.name,
      exemption_type: e.exemption_type,
      created_at: e.created_at,
    }));
  }

  async setExemption(params: {
    student_id: string;
    academic_year: string;
    service_id: string;
    exemption_type: string;
  }): Promise<StudentServiceExemption> {
    let e = await this.exemptionRepo.findOne({
      where: {
        student: { id: params.student_id },
        academic_year: params.academic_year,
        service: { id: params.service_id },
      },
    });
    if (e) {
      e.exemption_type = params.exemption_type;
      return this.exemptionRepo.save(e);
    }
    e = this.exemptionRepo.create({
      student: { id: params.student_id },
      academic_year: params.academic_year.trim(),
      service: { id: params.service_id },
      exemption_type: params.exemption_type,
    });
    return this.exemptionRepo.save(e);
  }

  async deleteExemption(id: string): Promise<{ deleted: boolean }> {
    const e = await this.exemptionRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('Exemption not found');
    await this.exemptionRepo.remove(e);
    return { deleted: true };
  }
}
