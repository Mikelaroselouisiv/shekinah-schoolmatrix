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
import { Class } from '../classes/class.entity';
import { Subject } from '../subjects/subject.entity';

@Entity('class_day_subject')
@Index('IDX_class_day_subject_class_year_day', [
  'class_id',
  'academic_year',
  'day_of_week',
  'sort_order',
])
export class ClassDaySubject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  class_id: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ type: 'varchar', length: 20, nullable: true })
  academic_year: string | null;

  @Column({ type: 'smallint' })
  day_of_week: number;

  @Column({ type: 'uuid' })
  subject_id: string;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @Column({ type: 'smallint', default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
