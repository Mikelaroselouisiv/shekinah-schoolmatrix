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

@Entity('parent_meeting')
@Index(['academic_year', 'meeting_date'])
export class ParentMeeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academic_year: AcademicYear;

  @Column({ type: 'date' })
  meeting_date: string;

  @Column({ type: 'varchar', length: 5 })
  start_time: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ type: 'varchar', length: 500 })
  objective: string;

  /** SCHOOL | OTHER */
  @Column({ type: 'varchar', length: 20, default: 'SCHOOL' })
  location_kind: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location_text: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
