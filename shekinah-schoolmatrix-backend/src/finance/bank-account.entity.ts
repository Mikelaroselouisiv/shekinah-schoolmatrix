import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Bank } from './bank.entity';

@Entity('bank_account')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Bank, (b) => b.accounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bank_id' })
  bank: Bank;

  @Column({ type: 'uuid' })
  bank_id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  account_number: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  opening_balance: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
