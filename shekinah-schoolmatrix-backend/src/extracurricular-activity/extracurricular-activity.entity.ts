import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Class } from '../classes/class.entity';

@Entity('extracurricular_activity')
export class ExtracurricularActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academic_year: AcademicYear;

  @Column({ type: 'date' })
  activity_date: string;

  @Column({ type: 'varchar', length: 5 })
  start_time: string;

  @Column({ type: 'varchar', length: 5 })
  end_time: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ type: 'varchar', length: 200 })
  occasion: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  participation_fee: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  dress_code: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
