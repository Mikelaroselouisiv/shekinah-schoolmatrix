import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Class } from '../classes/class.entity';
import { FeeService } from './fee-service.entity';

@Entity('class_fee')
export class ClassFee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  academic_year: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @ManyToOne(() => FeeService, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: FeeService;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  /** Date d'échéance de paiement pour ce service (classe, année). Affichée aux parents sur la fiche élève. */
  @Column({ type: 'date', nullable: true })
  due_date: Date | null;

  @Column({ type: 'text', nullable: true })
  detail: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
