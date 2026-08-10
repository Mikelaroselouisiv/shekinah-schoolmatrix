import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { FeeService } from './fee-service.entity';
import { BankAccount } from '../finance/bank-account.entity';

@Entity('payment_transaction')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ type: 'varchar', length: 20 })
  academic_year: string;

  @ManyToOne(() => FeeService, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: FeeService;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount_due: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount_paid: string;

  @Column({ type: 'date' })
  payment_date: Date;

  /** null = caisse ; sinon compte bancaire */
  @ManyToOne(() => BankAccount, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'bank_account_id' })
  bank_account: BankAccount | null;

  @Column({ type: 'uuid', nullable: true })
  bank_account_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
