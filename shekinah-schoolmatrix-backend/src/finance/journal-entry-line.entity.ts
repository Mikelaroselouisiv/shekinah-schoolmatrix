import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { JournalEntry } from './journal-entry.entity';
import { Account } from './account.entity';

/** Ligne d'écriture : compte débit/crédit, montant. */
@Entity('journal_entry_line')
export class JournalEntryLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => JournalEntry, (entry) => entry.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: JournalEntry;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  debit: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  credit: string;

  @Column({ type: 'text', nullable: true })
  line_label: string | null;
}
