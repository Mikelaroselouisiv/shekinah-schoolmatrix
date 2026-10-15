import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';

@Entity('school_vacation')
@Index(['academic_year', 'start_date'])
export class SchoolVacation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academic_year: AcademicYear;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  @Column({ type: 'varchar', length: 200 })
  motif: string;

  /** VACANCE ou CONGE. */
  @Column({ type: 'varchar', length: 20, default: 'VACANCE' })
  kind: string;

  @ManyToOne(() => Class, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
