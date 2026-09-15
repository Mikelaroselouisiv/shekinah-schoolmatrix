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

/** Moments courts de la journée de classe (pas un cours d’une heure). */
export const CLASS_MOMENT_KINDS = ['ENTRY', 'RECESS', 'CLOSING'] as const;
export type ClassMomentKind = (typeof CLASS_MOMENT_KINDS)[number];

@Entity('class_day_moment')
@Index('IDX_class_day_moment_class_year', ['class_id', 'academic_year'])
export class ClassDayMoment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  class_id: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  /** Nom d’année académique, comme schedule_slot.academic_year. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  academic_year: string | null;

  /** ENTRY | RECESS | CLOSING */
  @Column({ type: 'varchar', length: 20 })
  kind: ClassMomentKind;

  /** 0 = dimanche … 6 = samedi */
  @Column({ type: 'smallint' })
  day_of_week: number;

  @Column({ type: 'varchar', length: 5 })
  start_time: string;

  @Column({ type: 'varchar', length: 5 })
  end_time: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  label: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
