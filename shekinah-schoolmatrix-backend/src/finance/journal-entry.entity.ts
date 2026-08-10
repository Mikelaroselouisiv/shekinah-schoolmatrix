import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Exercice } from './exercice.entity';
import { JournalEntryLine } from './journal-entry-line.entity';

/** Écriture comptable (journal) : en-tête. */
@Entity('journal_entry')
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Exercice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exercice_id' })
  exercice: Exercice;

  @Column({ type: 'date' })
  entry_date: string;

  @Column({ type: 'text' })
  label: string;

  /** ECONOMAT | AUTRE_REVENU | DEPENSE | OUVERTURE | CLOTURE | MANUEL */
  @Column({ type: 'varchar', length: 30 })
  source: string;

  /** Référence externe (payment_transaction.id, expense.id, other_revenue.id...) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  source_ref: string | null;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => JournalEntryLine, (line) => line.entry, { cascade: true })
  lines: JournalEntryLine[];
}
