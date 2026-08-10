import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exercice } from './exercice.entity';
import { Account } from './account.entity';
import { JournalEntry } from './journal-entry.entity';
import { JournalEntryLine } from './journal-entry-line.entity';
import { OtherRevenue } from './other-revenue.entity';
import { Expense } from './expense.entity';
import { Bank } from './bank.entity';
import { BankAccount } from './bank-account.entity';
import { FeeService } from '../economat/fee-service.entity';
import { PaymentTransaction } from '../economat/payment-transaction.entity';
import { suggestAccountFromCode } from './plan-comptable-reference';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Plan comptable type école : actif, passif, charges, produits, résultat, report à nouveau. */
const DEFAULT_ACCOUNTS = [
  { code: '220000', label: 'Immobilisations', type: 'ACTIF' },
  { code: '120000', label: 'Clients', type: 'ACTIF' },
  { code: '512000', label: 'Caisse', type: 'ACTIF' },
  { code: '580000', label: 'Banque', type: 'ACTIF' },
  { code: '101000', label: 'Capital', type: 'PASSIF' },
  { code: '160000', label: 'Dettes fournisseurs', type: 'PASSIF' },
  { code: '129000', label: 'Report à nouveau', type: 'PASSIF' },
  { code: '890000', label: 'Résultat de l\'exercice', type: 'PASSIF' }, // utilisé en clôture
  { code: '601000', label: 'Achats', type: 'CHARGE' },
  { code: '606000', label: 'Autres charges', type: 'CHARGE' },
  { code: '706000', label: 'Recettes scolaires', type: 'PRODUIT' },
  { code: '701000', label: 'Autres produits', type: 'PRODUIT' },
];

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Exercice)
    private readonly exerciceRepo: Repository<Exercice>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(JournalEntry)
    private readonly entryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalEntryLine)
    private readonly lineRepo: Repository<JournalEntryLine>,
    @InjectRepository(OtherRevenue)
    private readonly otherRevenueRepo: Repository<OtherRevenue>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(FeeService)
    private readonly feeServiceRepo: Repository<FeeService>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(Bank)
    private readonly bankRepo: Repository<Bank>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepo: Repository<BankAccount>,
  ) {}

  async ensureDefaultAccounts(): Promise<void> {
    for (const a of DEFAULT_ACCOUNTS) {
      const existing = await this.accountRepo.findOne({ where: { code: a.code } });
      if (!existing) {
        await this.accountRepo.save(this.accountRepo.create(a));
      }
    }
  }

  /** Retourne l'exercice ouvert contenant la date (pour enregistrer une écriture). */
  async getExerciceForDate(entryDate: string): Promise<Exercice | null> {
    return this.exerciceRepo
      .createQueryBuilder('e')
      .where('e.statut = :st', { st: 'OUVERT' })
      .andWhere('e.date_debut <= :d', { d: entryDate })
      .andWhere('e.date_fin >= :d', { d: entryDate })
      .getOne();
  }

  /** Retourne l'exercice ouvert s'il existe (ne crée rien). */
  async ensureOpenExercice(): Promise<Exercice | null> {
    return this.exerciceRepo.findOne({ where: { statut: 'OUVERT' } });
  }

  async findExercices(): Promise<Exercice[]> {
    return this.exerciceRepo.find({
      order: { date_debut: 'DESC' },
    });
  }

  async getOpenExercice(): Promise<Exercice | null> {
    return this.exerciceRepo.findOne({ where: { statut: 'OUVERT' } });
  }

  async createExercice(params: { date_debut: string; date_fin: string }): Promise<Exercice> {
    const open = await this.getOpenExercice();
    if (open) throw new BadRequestException('Un exercice est déjà ouvert. Clôturez-le avant d\'en créer un nouveau.');
    const ex = this.exerciceRepo.create({
      date_debut: params.date_debut,
      date_fin: params.date_fin,
      statut: 'OUVERT',
    });
    return this.exerciceRepo.save(ex);
  }

  /** Ouvre le premier exercice (aucun report). L'utilisateur saisit ensuite l'écriture d'ouverture (immobilisations, passifs, etc.). */
  async openFirstExercice(params: { date_debut: string; date_fin: string }): Promise<Exercice> {
    const open = await this.getOpenExercice();
    if (open) throw new BadRequestException('Un exercice est déjà ouvert.');
    const ex = this.exerciceRepo.create({
      date_debut: params.date_debut,
      date_fin: params.date_fin,
      statut: 'OUVERT',
    });
    return this.exerciceRepo.save(ex);
  }

  /** Clôture l'exercice en cours (écritures de clôture : charges/produits → résultat → report), puis ouvre le suivant avec écriture d'ouverture (report des soldes bilan). */
  async openNextExercice(params: { date_debut: string; date_fin: string }): Promise<Exercice> {
    const current = await this.getOpenExercice();
    if (!current) throw new BadRequestException('Aucun exercice ouvert. Ouvrez d\'abord un exercice.');
    await this.closeExercice(current.id);
    const ex = this.exerciceRepo.create({
      date_debut: params.date_debut,
      date_fin: params.date_fin,
      statut: 'OUVERT',
    });
    const saved = await this.exerciceRepo.save(ex);
    await this.createOpeningEntriesFromPrevious(saved.id, current.id);
    return saved;
  }

  /** Crée l'écriture d'ouverture du nouvel exercice à partir des soldes de clôture du précédent (comptes de bilan : ACTIF, PASSIF, 129). */
  private async createOpeningEntriesFromPrevious(newExerciceId: string, previousExerciceId: string): Promise<void> {
    const balance = await this.getBalanceByAccount(previousExerciceId);
    const bilanTypes = ['ACTIF', 'PASSIF'];
    const accounts = await this.accountRepo.find({ where: {} });
    const accountByCode: Record<string, Account> = {};
    for (const a of accounts) accountByCode[a.code] = a;

    const lines: { account_id: string; debit: number; credit: number; line_label?: string }[] = [];
    for (const row of balance) {
      const acc = accountByCode[row.account_code];
      if (!acc || (!bilanTypes.includes(acc.type) && acc.code !== '129000')) continue;
      const solde = row.solde;
      if (Math.abs(solde) < 0.01) continue;
      if (solde > 0) lines.push({ account_id: acc.id, debit: solde, credit: 0, line_label: `Report ${row.account_code}` });
      else lines.push({ account_id: acc.id, debit: 0, credit: -solde, line_label: `Report ${row.account_code}` });
    }
    if (lines.length === 0) return;
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
    if (Math.abs(diff) > 0.01) {
      const reportAcc = accountByCode['129000'];
      if (reportAcc) {
        if (diff > 0) lines.push({ account_id: reportAcc.id, debit: 0, credit: diff, line_label: 'Report à nouveau' });
        else lines.push({ account_id: reportAcc.id, debit: -diff, credit: 0, line_label: 'Report à nouveau' });
      }
    }
    await this.createJournalEntry({
      exercice_id: newExerciceId,
      entry_date: (await this.exerciceRepo.findOne({ where: { id: newExerciceId } }))!.date_debut,
      label: 'Report à nouveau (ouverture d\'exercice)',
      source: 'OUVERTURE',
      source_ref: null,
      lines,
    });
  }

  async closeExercice(id: string): Promise<Exercice> {
    const ex = await this.exerciceRepo.findOne({ where: { id } });
    if (!ex) throw new NotFoundException('Exercice non trouvé');
    if (ex.statut === 'CLOTURE') throw new BadRequestException('Exercice déjà clôturé');

    await this.ensureDefaultAccounts();
    const balance = await this.getBalanceByAccount(id);
    const accounts = await this.accountRepo.find({ where: {} });
    const accountByCode: Record<string, Account> = {};
    for (const a of accounts) accountByCode[a.code] = a;
    const resultatAcc = accountByCode['890000'];
    const reportAcc = accountByCode['129000'];
    if (!resultatAcc || !reportAcc) throw new BadRequestException('Plan comptable incomplet (comptes 890000 et 129000 requis).');

    const lines: { account_id: string; debit: number; credit: number; line_label?: string }[] = [];
    let debitResultat = 0;
    let creditResultat = 0;
    for (const row of balance) {
      const acc = accountByCode[row.account_code];
      if (!acc || acc.code === '890000' || acc.code === '129000') continue;
      if (acc.type === 'CHARGE' && row.solde > 0) {
        lines.push({ account_id: acc.id, debit: 0, credit: row.solde, line_label: 'Clôture' });
        debitResultat += row.solde;
      } else if (acc.type === 'PRODUIT' && row.solde < 0) {
        const credit = -row.solde;
        lines.push({ account_id: acc.id, debit: credit, credit: 0, line_label: 'Clôture' });
        creditResultat += credit;
      }
    }
    if (debitResultat > 0 || creditResultat > 0) {
      lines.push({ account_id: resultatAcc.id, debit: debitResultat, credit: creditResultat, line_label: 'Résultat' });
    }
    if (lines.length > 0) {
      await this.createJournalEntry({
        exercice_id: id,
        entry_date: ex.date_fin,
        label: 'Clôture des comptes de charges et produits',
        source: 'CLOTURE',
        source_ref: null,
        lines,
      });
    }
    const balanceAfter = await this.getBalanceByAccount(id);
    const resultatRow = balanceAfter.find((r) => r.account_code === '890000');
    const resultatVal = resultatRow ? resultatRow.solde : 0;
    if (Math.abs(resultatVal) > 0.01) {
      await this.createJournalEntry({
        exercice_id: id,
        entry_date: ex.date_fin,
        label: 'Report du résultat à nouveau',
        source: 'CLOTURE',
        source_ref: null,
        lines:
          resultatVal > 0
            ? [
                { account_id: resultatAcc.id, debit: resultatVal, credit: 0, line_label: 'Virement' },
                { account_id: reportAcc.id, debit: 0, credit: resultatVal, line_label: 'Virement' },
              ]
            : [
                { account_id: reportAcc.id, debit: -resultatVal, credit: 0, line_label: 'Virement' },
                { account_id: resultatAcc.id, debit: 0, credit: -resultatVal, line_label: 'Virement' },
              ],
      });
    }

    ex.statut = 'CLOTURE';
    ex.date_cloture = new Date().toISOString().slice(0, 10);
    return this.exerciceRepo.save(ex);
  }

  async findAccounts(): Promise<Account[]> {
    return this.accountRepo.find({
      order: { code: 'ASC' },
      relations: ['parent'],
    });
  }

  async createAccount(params: { code: string; label: string; type: string; parent_id?: string }): Promise<Account> {
    const existing = await this.accountRepo.findOne({ where: { code: params.code } });
    if (existing) throw new BadRequestException('Un compte avec ce code existe déjà');
    const acc = this.accountRepo.create({
      code: params.code.trim(),
      label: params.label.trim(),
      type: params.type,
      parent_id: params.parent_id || null,
    });
    return this.accountRepo.save(acc);
  }

  async updateAccount(id: string, params: Partial<{ label: string; type: string }>): Promise<Account> {
    const acc = await this.accountRepo.findOne({ where: { id } });
    if (!acc) throw new NotFoundException('Compte non trouvé');
    if (params.label !== undefined) acc.label = params.label.trim();
    if (params.type !== undefined) acc.type = params.type;
    return this.accountRepo.save(acc);
  }

  async getAccountByCode(code: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { code } });
  }

  /** Suggère le type (ACTIF, PASSIF, CHARGE, PRODUIT) et un libellé à partir du code, selon le PCG. */
  suggestAccountType(code: string): { type: string; label_suggestion?: string } {
    return suggestAccountFromCode(code);
  }

  async createJournalEntry(params: {
    exercice_id: string;
    entry_date: string;
    label: string;
    source: string;
    source_ref?: string | null;
    lines: { account_id: string; debit: number; credit: number; line_label?: string }[];
  }): Promise<JournalEntry> {
    const totalDebit = params.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = params.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException('Les montants débit et crédit doivent être égaux');
    }
    const exercice = await this.exerciceRepo.findOne({ where: { id: params.exercice_id } });
    if (!exercice) throw new NotFoundException('Exercice non trouvé');
    if (exercice.statut === 'CLOTURE') throw new BadRequestException('Impossible d\'ajouter une écriture sur un exercice clôturé');

    const entry = this.entryRepo.create({
      exercice: { id: params.exercice_id } as Exercice,
      entry_date: params.entry_date,
      label: params.label,
      source: params.source,
      source_ref: params.source_ref ?? null,
    });
    const saved = await this.entryRepo.save(entry);
    for (const l of params.lines) {
      const line = this.lineRepo.create({
        entry: saved,
        account: { id: l.account_id } as Account,
        debit: String(l.debit),
        credit: String(l.credit),
        line_label: l.line_label ?? null,
      });
      await this.lineRepo.save(line);
    }
    return this.entryRepo.findOne({
      where: { id: saved.id },
      relations: ['lines', 'lines.account'],
    }) as Promise<JournalEntry>;
  }

  async findJournalEntries(filters: { exercice_id?: string; date_from?: string; date_to?: string }): Promise<any[]> {
    const qb = this.entryRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.lines', 'line')
      .leftJoinAndSelect('line.account', 'acc')
      .orderBy('e.entry_date', 'ASC')
      .addOrderBy('e.created_at', 'ASC');
    if (filters.exercice_id) qb.andWhere('e.exercice_id = :ex', { ex: filters.exercice_id });
    if (filters.date_from) qb.andWhere('e.entry_date >= :df', { df: filters.date_from });
    if (filters.date_to) qb.andWhere('e.entry_date <= :dt', { dt: filters.date_to });
    const list = await qb.getMany();
    return list.map((e) => ({
      id: e.id,
      entry_date: e.entry_date,
      label: e.label,
      source: e.source,
      source_ref: e.source_ref,
      created_at: e.created_at,
      lines: (e.lines || []).map((l: any) => ({
        account_code: l.account?.code,
        account_label: l.account?.label,
        debit: Number(l.debit),
        credit: Number(l.credit),
        line_label: l.line_label,
      })),
    }));
  }

  async findOtherRevenues(filters: { date_from?: string; date_to?: string; fee_service_id?: string }): Promise<any[]> {
    const qb = this.otherRevenueRepo
      .createQueryBuilder('r')
      .orderBy('r.revenue_date', 'DESC')
      .addOrderBy('r.created_at', 'DESC');
    if (filters.date_from) qb.andWhere('r.revenue_date >= :df', { df: filters.date_from });
    if (filters.date_to) qb.andWhere('r.revenue_date <= :dt', { dt: filters.date_to });
    if (filters.fee_service_id !== undefined) qb.andWhere('r.fee_service_id = :fs', { fs: filters.fee_service_id });
    const list = await qb.getMany();
    return list.map((r) => ({
      id: r.id,
      revenue_date: r.revenue_date,
      amount: Number(r.amount),
      label: r.label,
      category: r.category,
      fee_service_id: r.fee_service_id,
      created_at: r.created_at,
    }));
  }

  async createOtherRevenue(params: {
    revenue_date: string;
    amount: number;
    label: string;
    category?: string;
    fee_service_id?: string | null;
  }): Promise<OtherRevenue> {
    await this.ensureDefaultAccounts();
    const exercice = await this.getExerciceForDate(params.revenue_date);
    if (!exercice) throw new BadRequestException('Aucun exercice ouvert pour cette date. Ouvrez un exercice dont la période inclut la date du revenu.');
    const caisse = await this.getAccountByCode('512000');
    const produits = await this.getAccountByCode('701000');
    if (!caisse || !produits) throw new BadRequestException('Plan comptable incomplet. Comptes 512000 et 701000 requis.');

    const rev = this.otherRevenueRepo.create({
      revenue_date: params.revenue_date,
      amount: String(params.amount),
      label: params.label.trim(),
      category: params.category?.trim() || null,
      fee_service_id: params.fee_service_id || null,
    });
    const saved = await this.otherRevenueRepo.save(rev);
    await this.createJournalEntry({
      exercice_id: exercice.id,
      entry_date: params.revenue_date,
      label: params.label.trim(),
      source: 'AUTRE_REVENU',
      source_ref: saved.id,
      lines: [
        { account_id: caisse.id, debit: params.amount, credit: 0, line_label: params.label },
        { account_id: produits.id, debit: 0, credit: params.amount, line_label: params.label },
      ],
    });
    return saved;
  }

  async findExpenses(filters: { date_from?: string; date_to?: string; fee_service_id?: string; statut?: string }): Promise<any[]> {
    const qb = this.expenseRepo
      .createQueryBuilder('e')
      .orderBy('e.expense_date', 'DESC')
      .addOrderBy('e.created_at', 'DESC');
    if (filters.date_from) qb.andWhere('e.expense_date >= :df', { df: filters.date_from });
    if (filters.date_to) qb.andWhere('e.expense_date <= :dt', { dt: filters.date_to });
    if (filters.fee_service_id !== undefined) qb.andWhere('e.fee_service_id = :fs', { fs: filters.fee_service_id });
    if (filters.statut) qb.andWhere('e.statut = :st', { st: filters.statut });
    const list = await qb.getMany();
    return list.map((e) => ({
      id: e.id,
      expense_date: e.expense_date,
      amount: Number(e.amount),
      label: e.label,
      beneficiary: e.beneficiary,
      category: e.category,
      document_ref: e.document_ref,
      statut: e.statut,
      fee_service_id: e.fee_service_id,
      bank_account_id: e.bank_account_id,
      created_at: e.created_at,
    }));
  }

  async createExpense(params: {
    expense_date: string;
    amount: number;
    label: string;
    beneficiary?: string;
    category?: string;
    document_ref?: string;
    fee_service_id?: string | null;
    bank_account_id?: string | null;
  }): Promise<Expense> {
    if (params.bank_account_id) {
      const ba = await this.bankAccountRepo.findOne({ where: { id: params.bank_account_id, active: true } });
      if (!ba) throw new BadRequestException('Compte bancaire introuvable');
    }
    const exp = this.expenseRepo.create({
      expense_date: params.expense_date,
      amount: String(params.amount),
      label: params.label.trim(),
      beneficiary: params.beneficiary?.trim() || null,
      category: params.category?.trim() || null,
      document_ref: params.document_ref?.trim() || null,
      statut: 'BROUILLON',
      fee_service_id: params.fee_service_id || null,
      bank_account_id: params.bank_account_id || null,
    });
    return this.expenseRepo.save(exp);
  }

  async updateExpense(
    id: string,
    params: Partial<{
      label: string;
      beneficiary: string;
      category: string;
      document_ref: string;
      fee_service_id: string | null;
      bank_account_id: string | null;
    }>,
  ): Promise<Expense> {
    const exp = await this.expenseRepo.findOne({ where: { id } });
    if (!exp) throw new NotFoundException('Dépense non trouvée');
    if (exp.statut === 'VALIDEE') throw new BadRequestException('Impossible de modifier une dépense validée');
    if (params.label !== undefined) exp.label = params.label.trim();
    if (params.beneficiary !== undefined) exp.beneficiary = params.beneficiary?.trim() || null;
    if (params.category !== undefined) exp.category = params.category?.trim() || null;
    if (params.document_ref !== undefined) exp.document_ref = params.document_ref?.trim() || null;
    if (params.fee_service_id !== undefined) exp.fee_service_id = params.fee_service_id || null;
    if (params.bank_account_id !== undefined) {
      if (params.bank_account_id) {
        const ba = await this.bankAccountRepo.findOne({ where: { id: params.bank_account_id, active: true } });
        if (!ba) throw new BadRequestException('Compte bancaire introuvable');
      }
      exp.bank_account_id = params.bank_account_id || null;
    }
    return this.expenseRepo.save(exp);
  }

  async validateExpense(id: string): Promise<Expense> {
    const exp = await this.expenseRepo.findOne({ where: { id } });
    if (!exp) throw new NotFoundException('Dépense non trouvée');
    if (exp.statut === 'VALIDEE') throw new BadRequestException('Dépense déjà validée');

    await this.ensureDefaultAccounts();
    const exercice = await this.getExerciceForDate(exp.expense_date);
    if (!exercice) throw new BadRequestException('Aucun exercice ouvert pour la date de cette dépense. Ouvrez un exercice dont la période inclut la date.');
    const cashAccount = await this.getAccountByCode(exp.bank_account_id ? '580000' : '512000');
    const charges = await this.getAccountByCode('606000');
    if (!cashAccount || !charges) throw new BadRequestException('Plan comptable incomplet.');

    exp.statut = 'VALIDEE';
    await this.expenseRepo.save(exp);

    await this.createJournalEntry({
      exercice_id: exercice.id,
      entry_date: exp.expense_date,
      label: exp.label,
      source: 'DEPENSE',
      source_ref: exp.id,
      lines: [
        { account_id: charges.id, debit: Number(exp.amount), credit: 0, line_label: exp.label },
        { account_id: cashAccount.id, debit: 0, credit: Number(exp.amount), line_label: exp.label },
      ],
    });
    return exp;
  }

  async deleteExpense(id: string): Promise<{ deleted: boolean }> {
    const exp = await this.expenseRepo.findOne({ where: { id } });
    if (!exp) throw new NotFoundException('Dépense non trouvée');
    if (exp.statut === 'VALIDEE') throw new BadRequestException('Impossible de supprimer une dépense validée');
    await this.expenseRepo.remove(exp);
    return { deleted: true };
  }

  /** Appelé après enregistrement d'un paiement dans l'économat : crée l'écriture comptable (si un exercice ouvert contient la date). */
  async recordEconomatPayment(tx: PaymentTransaction): Promise<void> {
    await this.ensureDefaultAccounts();
    const dateStr = typeof tx.payment_date === 'string' ? tx.payment_date : (tx.payment_date as Date).toISOString().slice(0, 10);
    const exercice = await this.getExerciceForDate(dateStr);
    if (!exercice) return;
    const bankAccountId = tx.bank_account_id ?? (tx as any).bank_account?.id ?? null;
    const cashAccount = await this.getAccountByCode(bankAccountId ? '580000' : '512000');
    const recettes = await this.getAccountByCode('706000');
    if (!cashAccount || !recettes) return;

    const amount = Number(tx.amount_paid);
    if (amount <= 0) return;

    const full = await this.transactionRepo.findOne({ where: { id: tx.id }, relations: ['service'] });
    const serviceName = (full as any)?.service?.name || 'scolaire';
    const label = `Paiement ${serviceName} - ${dateStr}`;
    await this.createJournalEntry({
      exercice_id: exercice.id,
      entry_date: dateStr,
      label,
      source: 'ECONOMAT',
      source_ref: tx.id,
      lines: [
        { account_id: cashAccount.id, debit: amount, credit: 0, line_label: label },
        { account_id: recettes.id, debit: 0, credit: amount, line_label: label },
      ],
    });
  }

  // ─── Banques & comptes ───────────────────────────────────────────────

  async findBanks(): Promise<any[]> {
    const banks = await this.bankRepo.find({
      relations: ['accounts'],
      order: { name: 'ASC' },
    });
    const balances = await this.computeBankAccountBalances();
    return banks.map((b) => ({
      id: b.id,
      name: b.name,
      active: b.active,
      accounts: (b.accounts ?? [])
        .slice()
        .sort((a, c) => a.name.localeCompare(c.name))
        .map((a) => ({
          id: a.id,
          bank_id: b.id,
          name: a.name,
          account_number: a.account_number,
          opening_balance: Number(a.opening_balance),
          active: a.active,
          balance: balances.get(a.id) ?? Number(a.opening_balance),
          created_at: a.created_at,
        })),
      created_at: b.created_at,
    }));
  }

  async createBank(params: { name: string }): Promise<Bank> {
    const name = params.name?.trim();
    if (!name) throw new BadRequestException('Nom de banque requis');
    return this.bankRepo.save(this.bankRepo.create({ name, active: true }));
  }

  async updateBank(id: string, params: Partial<{ name: string; active: boolean }>): Promise<Bank> {
    const bank = await this.bankRepo.findOne({ where: { id } });
    if (!bank) throw new NotFoundException('Banque introuvable');
    if (params.name !== undefined) {
      const name = params.name.trim();
      if (!name) throw new BadRequestException('Nom de banque requis');
      bank.name = name;
    }
    if (params.active !== undefined) bank.active = params.active;
    return this.bankRepo.save(bank);
  }

  async deleteBank(id: string): Promise<{ deleted: boolean }> {
    const bank = await this.bankRepo.findOne({ where: { id }, relations: ['accounts'] });
    if (!bank) throw new NotFoundException('Banque introuvable');
    await this.bankRepo.remove(bank);
    return { deleted: true };
  }

  async createBankAccount(params: {
    bank_id: string;
    name: string;
    account_number?: string | null;
    opening_balance?: number;
  }): Promise<BankAccount> {
    const bank = await this.bankRepo.findOne({ where: { id: params.bank_id } });
    if (!bank) throw new NotFoundException('Banque introuvable');
    const name = params.name?.trim();
    if (!name) throw new BadRequestException('Nom du compte requis');
    const account = this.bankAccountRepo.create({
      bank_id: params.bank_id,
      bank: { id: params.bank_id } as Bank,
      name,
      account_number: params.account_number?.trim() || null,
      opening_balance: String(params.opening_balance ?? 0),
      active: true,
    });
    return this.bankAccountRepo.save(account);
  }

  async updateBankAccount(
    id: string,
    params: Partial<{ name: string; account_number: string | null; opening_balance: number; active: boolean }>,
  ): Promise<BankAccount> {
    const account = await this.bankAccountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Compte bancaire introuvable');
    if (params.name !== undefined) {
      const name = params.name.trim();
      if (!name) throw new BadRequestException('Nom du compte requis');
      account.name = name;
    }
    if (params.account_number !== undefined) account.account_number = params.account_number?.trim() || null;
    if (params.opening_balance !== undefined) account.opening_balance = String(params.opening_balance);
    if (params.active !== undefined) account.active = params.active;
    return this.bankAccountRepo.save(account);
  }

  async deleteBankAccount(id: string): Promise<{ deleted: boolean }> {
    const account = await this.bankAccountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Compte bancaire introuvable');
    await this.bankAccountRepo.remove(account);
    return { deleted: true };
  }

  /** Liste plate des comptes actifs (pour sélecteurs paiement / dépense). */
  async listActiveBankAccounts(): Promise<
    { id: string; label: string; bank_id: string; bank_name: string; account_name: string; balance: number }[]
  > {
    const accounts = await this.bankAccountRepo.find({
      where: { active: true },
      relations: ['bank'],
      order: { name: 'ASC' },
    });
    const balances = await this.computeBankAccountBalances();
    return accounts
      .filter((a) => a.bank?.active !== false)
      .map((a) => ({
        id: a.id,
        bank_id: a.bank_id,
        bank_name: a.bank?.name ?? '—',
        account_name: a.name,
        label: `${a.bank?.name ?? '—'} — ${a.name}`,
        balance: balances.get(a.id) ?? Number(a.opening_balance),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async computeBankAccountBalances(): Promise<Map<string, number>> {
    const accounts = await this.bankAccountRepo.find();
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, Number(a.opening_balance) || 0);

    const paid = await this.transactionRepo
      .createQueryBuilder('t')
      .select('t.bank_account_id', 'bank_account_id')
      .addSelect('SUM(t.amount_paid)', 'total')
      .where('t.bank_account_id IS NOT NULL')
      .groupBy('t.bank_account_id')
      .getRawMany();
    for (const row of paid) {
      const id = row.bank_account_id as string;
      if (!id) continue;
      map.set(id, round2((map.get(id) ?? 0) + Number(row.total ?? 0)));
    }

    const spent = await this.expenseRepo
      .createQueryBuilder('e')
      .select('e.bank_account_id', 'bank_account_id')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.bank_account_id IS NOT NULL')
      .andWhere('e.statut = :st', { st: 'VALIDEE' })
      .groupBy('e.bank_account_id')
      .getRawMany();
    for (const row of spent) {
      const id = row.bank_account_id as string;
      if (!id) continue;
      map.set(id, round2((map.get(id) ?? 0) - Number(row.total ?? 0)));
    }

    return map;
  }

  async getBankAccountsMonitor(): Promise<{
    total_balance: number;
    accounts: {
      id: string;
      bank_id: string;
      bank_name: string;
      account_name: string;
      account_number: string | null;
      opening_balance: number;
      inflows: number;
      outflows: number;
      balance: number;
    }[];
  }> {
    const accounts = await this.bankAccountRepo.find({
      relations: ['bank'],
      order: { name: 'ASC' },
    });
    const paidRows = await this.transactionRepo
      .createQueryBuilder('t')
      .select('t.bank_account_id', 'bank_account_id')
      .addSelect('SUM(t.amount_paid)', 'total')
      .where('t.bank_account_id IS NOT NULL')
      .groupBy('t.bank_account_id')
      .getRawMany();
    const spentRows = await this.expenseRepo
      .createQueryBuilder('e')
      .select('e.bank_account_id', 'bank_account_id')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.bank_account_id IS NOT NULL')
      .andWhere('e.statut = :st', { st: 'VALIDEE' })
      .groupBy('e.bank_account_id')
      .getRawMany();
    const inflows = new Map(paidRows.map((r) => [r.bank_account_id as string, Number(r.total ?? 0)]));
    const outflows = new Map(spentRows.map((r) => [r.bank_account_id as string, Number(r.total ?? 0)]));

    const list = accounts
      .filter((a) => a.active && a.bank?.active !== false)
      .map((a) => {
        const opening = Number(a.opening_balance) || 0;
        const inflow = inflows.get(a.id) ?? 0;
        const outflow = outflows.get(a.id) ?? 0;
        return {
          id: a.id,
          bank_id: a.bank_id,
          bank_name: a.bank?.name ?? '—',
          account_name: a.name,
          account_number: a.account_number,
          opening_balance: opening,
          inflows: round2(inflow),
          outflows: round2(outflow),
          balance: round2(opening + inflow - outflow),
        };
      })
      .sort((a, b) => `${a.bank_name}${a.account_name}`.localeCompare(`${b.bank_name}${b.account_name}`));

    return {
      total_balance: round2(list.reduce((s, a) => s + a.balance, 0)),
      accounts: list,
    };
  }

  /** Activités parascolaires = fee_services avec nature PARASCOLAIRE */
  async getParaschoolActivities(): Promise<{ id: string; name: string; code: string | null }[]> {
    const list = await this.feeServiceRepo.find({
      where: { nature: 'PARASCOLAIRE', active: true },
      order: { name: 'ASC' },
    });
    return list.map((f) => ({ id: f.id, name: f.name, code: f.code }));
  }

  /** Moniteur : entrées / sorties sur une période, optionnellement filtré par activité (fee_service_id). */
  async getMonitorStats(params: { date_from: string; date_to: string; fee_service_id?: string | null }): Promise<{
    total_entrees: number;
    total_sorties: number;
    solde: number;
    detail_entrees_economat: number;
    detail_entrees_autres: number;
    detail_sorties: number;
  }> {
    await this.ensureDefaultAccounts();
    const caisseId = (await this.getAccountByCode('512000'))?.id;
    if (!caisseId) {
      return {
        total_entrees: 0,
        total_sorties: 0,
        solde: 0,
        detail_entrees_economat: 0,
        detail_entrees_autres: 0,
        detail_sorties: 0,
      };
    }

    const qbDebit = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('l.entry', 'e')
      .where('l.account_id = :cid', { cid: caisseId })
      .andWhere('e.entry_date >= :df', { df: params.date_from })
      .andWhere('e.entry_date <= :dt', { dt: params.date_to })
      .select('SUM(l.debit)', 'tot');
    const qbCredit = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('l.entry', 'e')
      .where('l.account_id = :cid', { cid: caisseId })
      .andWhere('e.entry_date >= :df', { df: params.date_from })
      .andWhere('e.entry_date <= :dt', { dt: params.date_to })
      .select('SUM(l.credit)', 'tot');

    if (params.fee_service_id) {
      const txIds = await this.transactionRepo
        .createQueryBuilder('t')
        .where('t.service_id = :sid', { sid: params.fee_service_id })
        .andWhere('t.payment_date >= :df', { df: params.date_from })
        .andWhere('t.payment_date <= :dt', { dt: params.date_to })
        .select('t.id')
        .getMany();
      const ids = txIds.map((t) => t.id);
      let detailEconomat = 0;
      let detailAutres = 0;
      let detailSorties = 0;
      if (ids.length > 0) {
        const sumTx = await this.transactionRepo
          .createQueryBuilder('t')
          .where('t.id IN (:...ids)', { ids })
          .select('SUM(t.amount_paid)', 's')
          .getRawOne();
        detailEconomat = Number(sumTx?.s ?? 0);
      }
      const autres = await this.otherRevenueRepo
        .createQueryBuilder('r')
        .where('r.fee_service_id = :fs', { fs: params.fee_service_id })
        .andWhere('r.revenue_date >= :df', { df: params.date_from })
        .andWhere('r.revenue_date <= :dt', { dt: params.date_to })
        .select('SUM(r.amount)', 's')
        .getRawOne();
      detailAutres = Number(autres?.s ?? 0);
      const dep = await this.expenseRepo
        .createQueryBuilder('e')
        .where('e.fee_service_id = :fs', { fs: params.fee_service_id })
        .andWhere('e.statut = :st', { st: 'VALIDEE' })
        .andWhere('e.expense_date >= :df', { df: params.date_from })
        .andWhere('e.expense_date <= :dt', { dt: params.date_to })
        .select('SUM(e.amount)', 's')
        .getRawOne();
      detailSorties = Number(dep?.s ?? 0);
      const totalEntrees = detailEconomat + detailAutres;
      return {
        total_entrees: totalEntrees,
        total_sorties: detailSorties,
        solde: Math.round((totalEntrees - detailSorties) * 100) / 100,
        detail_entrees_economat: detailEconomat,
        detail_entrees_autres: detailAutres,
        detail_sorties: detailSorties,
      };
    }

    const debitRes = await qbDebit.getRawOne();
    const creditRes = await qbCredit.getRawOne();
    const totalEntrees = Number(creditRes?.tot ?? 0);
    const totalSorties = Number(debitRes?.tot ?? 0);

    const economatSum = await this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('l.entry', 'e')
      .where('e.source = :src', { src: 'ECONOMAT' })
      .andWhere('l.account_id = :cid', { cid: caisseId })
      .andWhere('e.entry_date >= :df', { df: params.date_from })
      .andWhere('e.entry_date <= :dt', { dt: params.date_to })
      .select('SUM(l.debit)', 's')
      .getRawOne();
    const sumEconomat = Number(economatSum?.s ?? 0);
    const autreRevSum = await this.otherRevenueRepo
      .createQueryBuilder('r')
      .where('r.revenue_date >= :df', { df: params.date_from })
      .andWhere('r.revenue_date <= :dt', { dt: params.date_to })
      .select('SUM(r.amount)', 's')
      .getRawOne();
    const detailAutres = Number(autreRevSum?.s ?? 0);

    return {
      total_entrees: totalEntrees,
      total_sorties: totalSorties,
      solde: Math.round((totalEntrees - totalSorties) * 100) / 100,
      detail_entrees_economat: Math.round(sumEconomat * 100) / 100,
      detail_entrees_autres: detailAutres,
      detail_sorties: totalSorties,
    };
  }

  async getBalanceByAccount(exercice_id: string): Promise<{ account_code: string; account_label: string; total_debit: number; total_credit: number; solde: number }[]> {
    const lines = await this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('l.entry', 'e')
      .innerJoinAndSelect('l.account', 'a')
      .where('e.exercice_id = :ex', { ex: exercice_id })
      .getMany();
    const byAccount: Record<string, { label: string; debit: number; credit: number }> = {};
    for (const l of lines) {
      const acc = (l as any).account;
      if (!acc) continue;
      const key = acc.code;
      if (!byAccount[key]) byAccount[key] = { label: acc.label, debit: 0, credit: 0 };
      byAccount[key].debit += Number(l.debit);
      byAccount[key].credit += Number(l.credit);
    }
    return Object.entries(byAccount).map(([code, v]) => ({
      account_code: code,
      account_label: v.label,
      total_debit: Math.round(v.debit * 100) / 100,
      total_credit: Math.round(v.credit * 100) / 100,
      solde: Math.round((v.debit - v.credit) * 100) / 100,
    }));
  }
}
