import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Dépense. Imputée à la trésorerie générale (fee_service_id null) ou à une activité (fee_service_id). */
@Entity('expense')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  expense_date: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  beneficiary: string | null; // fournisseur / bénéficiaire

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null; // compte charge (ex. 601, 606)

  @Column({ type: 'varchar', length: 100, nullable: true })
  document_ref: string | null; // numéro de pièce

  /** BROUILLON | VALIDEE */
  @Column({ type: 'varchar', length: 20, default: 'BROUILLON' })
  statut: string;

  /** null = trésorerie générale ; sinon fee_service.id (activité parascolaire) */
  @Column({ type: 'uuid', nullable: true })
  fee_service_id: string | null;

  /** null = caisse ; sinon compte bancaire */
  @Column({ type: 'uuid', nullable: true })
  bank_account_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
