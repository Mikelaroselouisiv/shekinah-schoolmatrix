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
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('exercices')
  async listExercices() {
    await this.financeService.ensureDefaultAccounts();
    const list = await this.financeService.findExercices();
    return { ok: true, exercices: list };
  }

  @Get('exercices/open')
  async getOpenExercice() {
    await this.financeService.ensureDefaultAccounts();
    const open = await this.financeService.getOpenExercice();
    return { ok: true, exercice: open };
  }

  @Post('exercices')
  async createExercice(@Body() body: { date_debut: string; date_fin: string }) {
    const ex = await this.financeService.createExercice(body);
    return { ok: true, exercice: ex };
  }

  @Post('exercices/open-first')
  async openFirstExercice(@Body() body: { date_debut: string; date_fin: string }) {
    const ex = await this.financeService.openFirstExercice(body);
    return { ok: true, exercice: ex };
  }

  @Post('exercices/open-next')
  async openNextExercice(@Body() body: { date_debut: string; date_fin: string }) {
    const ex = await this.financeService.openNextExercice(body);
    return { ok: true, exercice: ex };
  }

  @Patch('exercices/:id/close')
  async closeExercice(@Param('id') id: string) {
    const ex = await this.financeService.closeExercice(id);
    return { ok: true, exercice: ex };
  }

  @Get('accounts')
  async listAccounts() {
    await this.financeService.ensureDefaultAccounts();
    const list = await this.financeService.findAccounts();
    return { ok: true, accounts: list };
  }

  @Get('accounts/suggest-type')
  async suggestAccountType(@Query('code') code: string) {
    const result = this.financeService.suggestAccountType(code || '');
    return { ok: true, ...result };
  }

  @Post('accounts')
  async createAccount(@Body() body: { code: string; label: string; type: string; parent_id?: string }) {
    const acc = await this.financeService.createAccount(body);
    return { ok: true, account: acc };
  }

  @Patch('accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() body: Partial<{ label: string; type: string }>) {
    const acc = await this.financeService.updateAccount(id, body);
    return { ok: true, account: acc };
  }

  @Get('entries')
  async listEntries(
    @Query('exercice_id') exerciceId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    const list = await this.financeService.findJournalEntries({
      exercice_id: exerciceId,
      date_from: dateFrom,
      date_to: dateTo,
    });
    return { ok: true, entries: list };
  }

  @Post('entries')
  async createEntry(
    @Body()
    body: {
      exercice_id: string;
      entry_date: string;
      label: string;
      source: string;
      source_ref?: string;
      lines: { account_id: string; debit: number; credit: number; line_label?: string }[];
    },
  ) {
    const entry = await this.financeService.createJournalEntry(body);
    return { ok: true, entry };
  }

  @Get('other-revenues')
  async listOtherRevenues(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('fee_service_id') feeServiceId?: string,
  ) {
    const list = await this.financeService.findOtherRevenues({
      date_from: dateFrom,
      date_to: dateTo,
      fee_service_id: feeServiceId,
    });
    return { ok: true, other_revenues: list };
  }

  @Post('other-revenues')
  async createOtherRevenue(
    @Body()
    body: {
      revenue_date: string;
      amount: number;
      label: string;
      category?: string;
      fee_service_id?: string | null;
    },
  ) {
    const rev = await this.financeService.createOtherRevenue(body);
    return { ok: true, other_revenue: rev };
  }

  @Get('expenses')
  async listExpenses(
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('fee_service_id') feeServiceId?: string,
    @Query('statut') statut?: string,
  ) {
    const list = await this.financeService.findExpenses({
      date_from: dateFrom,
      date_to: dateTo,
      fee_service_id: feeServiceId,
      statut,
    });
    return { ok: true, expenses: list };
  }

  @Post('expenses')
  async createExpense(
    @Body()
    body: {
      expense_date: string;
      amount: number;
      label: string;
      beneficiary?: string;
      category?: string;
      document_ref?: string;
      fee_service_id?: string | null;
      bank_account_id?: string | null;
    },
  ) {
    const exp = await this.financeService.createExpense(body);
    return { ok: true, expense: exp };
  }

  @Patch('expenses/:id')
  async updateExpense(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      label: string;
      beneficiary: string;
      category: string;
      document_ref: string;
      fee_service_id: string | null;
      bank_account_id: string | null;
    }>,
  ) {
    const exp = await this.financeService.updateExpense(id, body);
    return { ok: true, expense: exp };
  }

  @Post('expenses/:id/validate')
  async validateExpense(@Param('id') id: string) {
    const exp = await this.financeService.validateExpense(id);
    return { ok: true, expense: exp };
  }

  @Delete('expenses/:id')
  async deleteExpense(@Param('id') id: string) {
    await this.financeService.deleteExpense(id);
    return { ok: true, deleted: true };
  }

  @Get('activities')
  async listParaschoolActivities() {
    const list = await this.financeService.getParaschoolActivities();
    return { ok: true, activities: list };
  }

  @Get('monitor')
  async getMonitorStats(
    @Query('date_from') dateFrom: string,
    @Query('date_to') dateTo: string,
    @Query('fee_service_id') feeServiceId?: string,
  ) {
    const stats = await this.financeService.getMonitorStats({
      date_from: dateFrom,
      date_to: dateTo,
      fee_service_id: feeServiceId || undefined,
    });
    return { ok: true, ...stats };
  }

  @Get('balance')
  async getBalance(@Query('exercice_id') exerciceId: string) {
    const balance = await this.financeService.getBalanceByAccount(exerciceId);
    return { ok: true, balance };
  }

  @Get('banks')
  async listBanks() {
    const banks = await this.financeService.findBanks();
    return { ok: true, banks };
  }

  @Post('banks')
  async createBank(@Body() body: { name: string }) {
    const bank = await this.financeService.createBank(body);
    return { ok: true, bank };
  }

  @Patch('banks/:id')
  async updateBank(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; active: boolean }>,
  ) {
    const bank = await this.financeService.updateBank(id, body);
    return { ok: true, bank };
  }

  @Delete('banks/:id')
  async deleteBank(@Param('id') id: string) {
    await this.financeService.deleteBank(id);
    return { ok: true, deleted: true };
  }

  @Get('bank-accounts')
  async listBankAccounts() {
    const accounts = await this.financeService.listActiveBankAccounts();
    return { ok: true, accounts };
  }

  @Post('bank-accounts')
  async createBankAccount(
    @Body()
    body: {
      bank_id: string;
      name: string;
      account_number?: string | null;
      opening_balance?: number;
    },
  ) {
    const account = await this.financeService.createBankAccount(body);
    return {
      ok: true,
      account: {
        id: account.id,
        bank_id: account.bank_id,
        name: account.name,
        account_number: account.account_number,
        opening_balance: Number(account.opening_balance),
        active: account.active,
      },
    };
  }

  @Patch('bank-accounts/:id')
  async updateBankAccount(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      account_number: string | null;
      opening_balance: number;
      active: boolean;
    }>,
  ) {
    const account = await this.financeService.updateBankAccount(id, body);
    return {
      ok: true,
      account: {
        id: account.id,
        bank_id: account.bank_id,
        name: account.name,
        account_number: account.account_number,
        opening_balance: Number(account.opening_balance),
        active: account.active,
      },
    };
  }

  @Delete('bank-accounts/:id')
  async deleteBankAccount(@Param('id') id: string) {
    await this.financeService.deleteBankAccount(id);
    return { ok: true, deleted: true };
  }
}
