import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { EconomatService } from './economat.service';
import { FinanceService } from '../finance/finance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('economat')
@UseGuards(JwtAuthGuard)
export class EconomatController {
  constructor(
    private readonly economatService: EconomatService,
    private readonly financeService: FinanceService,
  ) {}

  @Get('current-year')
  currentYear() {
    return { ok: true, academic_year: this.economatService.getCurrentAcademicYear() };
  }

  @Get('fee-services')
  async listFeeServices() {
    const list = await this.economatService.findAllFeeServices();
    return { ok: true, fee_services: list };
  }

  @Post('fee-services')
  async createFeeService(@Body() body: { name: string; code?: string; nature?: string }) {
    const s = await this.economatService.createFeeService({ name: body.name, code: body.code, nature: body.nature });
    return { ok: true, fee_service: { id: s.id, name: s.name, code: s.code, active: s.active, nature: s.nature } };
  }

  @Patch('fee-services/:id')
  async updateFeeService(@Param('id') id: string, @Body() body: Partial<{ name: string; code: string; active: boolean; nature: string }>) {
    const s = await this.economatService.updateFeeService(id, body);
    return { ok: true, fee_service: s };
  }

  @Delete('fee-services/:id')
  async deleteFeeService(@Param('id') id: string) {
    await this.economatService.deleteFeeService(id);
    return { ok: true, deleted: true };
  }

  @Get('class-fees')
  async listClassFees(
    @Query('academic_year') academicYear?: string,
    @Query('class_id') classId?: string,
  ) {
    const list = await this.economatService.findAllClassFees({ academic_year: academicYear, class_id: classId });
    return { ok: true, class_fees: list };
  }

  @Post('class-fees')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SCHOOL_ADMIN')
  async createClassFee(@Body() body: {
    academic_year: string;
    class_id: string;
    service_id: string;
    amount: number;
    due_date?: string | null;
    detail?: string;
  }) {
    const cf = await this.economatService.createClassFee(body);
    const dueDateStr = cf.due_date ? (typeof cf.due_date === 'string' ? cf.due_date : (cf.due_date as Date).toISOString().slice(0, 10)) : null;
    return {
      ok: true,
      class_fee: {
        id: cf.id,
        academic_year: cf.academic_year,
        class_id: cf.class?.id ?? (cf as any).classId,
        service_id: cf.service?.id ?? (cf as any).serviceId,
        amount: Number(cf.amount),
        due_date: dueDateStr,
        detail: cf.detail,
        created_at: cf.created_at,
      },
    };
  }

  @Patch('class-fees/:id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SCHOOL_ADMIN')
  async updateClassFee(@Param('id') id: string, @Body() body: Partial<{ amount: number; due_date: string | null; detail: string }>) {
    const cf = await this.economatService.updateClassFee(id, body);
    return { ok: true, class_fee: cf };
  }

  @Delete('class-fees/:id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SCHOOL_ADMIN')
  async deleteClassFee(@Param('id') id: string) {
    await this.economatService.deleteClassFee(id);
    return { ok: true, deleted: true };
  }

  @Get('balance')
  async getBalance(
    @Query('student_id') studentId?: string,
    @Query('academic_year') academicYear?: string,
    @Query('service_id') serviceId?: string,
  ) {
    const balance = await this.economatService.getBalance(studentId!, academicYear!, serviceId!);
    return { ok: true, ...balance };
  }

  @Post('payments')
  async recordPayment(@Body() body: {
    student_id: string;
    class_id: string;
    academic_year: string;
    service_id: string;
    amount_paid: number;
    payment_date: string;
    bank_account_id?: string | null;
  }) {
    const tx = await this.economatService.recordPayment(body);
    try {
      await this.financeService.recordEconomatPayment(tx);
    } catch {
      // ne pas faire échouer le paiement si la comptabilité échoue
    }
    return {
      ok: true,
      payment: {
        id: tx.id,
        student_id: tx.student?.id ?? (tx as any).studentId,
        academic_year: tx.academic_year,
        service_id: tx.service?.id ?? (tx as any).serviceId,
        amount_due: Number(tx.amount_due),
        amount_paid: Number(tx.amount_paid),
        payment_date: tx.payment_date,
        bank_account_id: tx.bank_account_id ?? null,
        created_at: tx.created_at,
      },
    };
  }

  @Get('transactions')
  async listTransactions(
    @Query('student_id') studentId?: string,
    @Query('academic_year') academicYear?: string,
    @Query('class_id') classId?: string,
  ) {
    const list = await this.economatService.findTransactions({
      student_id: studentId,
      academic_year: academicYear,
      class_id: classId,
    });
    return { ok: true, transactions: list };
  }

  @Get('student-payment-status/:studentId')
  async getStudentPaymentStatus(
    @Param('studentId') studentId: string,
    @Query('academic_year') academicYear?: string,
  ) {
    const status = await this.economatService.getStudentPaymentStatus(studentId, academicYear);
    return { ok: true, ...status };
  }

  @Get('exemptions')
  async listExemptions(
    @Query('student_id') studentId?: string,
    @Query('academic_year') academicYear?: string,
  ) {
    const list = await this.economatService.findExemptions({
      student_id: studentId,
      academic_year: academicYear,
    });
    return { ok: true, exemptions: list };
  }

  @Post('exemptions')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SCHOOL_ADMIN')
  async setExemption(@Body() body: {
    student_id: string;
    academic_year: string;
    service_id: string;
    exemption_type: string;
  }) {
    const e = await this.economatService.setExemption(body);
    return {
      ok: true,
      exemption: {
        id: e.id,
        student_id: e.student?.id ?? (e as any).studentId,
        academic_year: e.academic_year,
        service_id: e.service?.id ?? (e as any).serviceId,
        exemption_type: e.exemption_type,
        created_at: e.created_at,
      },
    };
  }

  @Delete('exemptions/:id')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SCHOOL_ADMIN')
  async deleteExemption(@Param('id') id: string) {
    await this.economatService.deleteExemption(id);
    return { ok: true, deleted: true };
  }
}
