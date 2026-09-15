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
import { User } from '../users/user.entity';
import { Class } from '../classes/class.entity';
import type { MorningDutyCycle } from '../roles/education-levels';

export const SCHOOL_DUTY_KINDS = [
  'ACCUEIL',
  'FLAG',
  'ANIMATION',
  'SERVICE',
  'DEVOTION',
  'DEFI',
  'PRIERE',
  'RENTREE',
] as const;
export type SchoolDutyKind = (typeof SCHOOL_DUTY_KINDS)[number];

@Entity('school_week_duty')
@Index('UQ_school_week_duty_user_slot', [
  'academic_year',
  'kind',
  'cycle',
  'day_of_week',
  'responsible_user_id',
], {
  unique: true,
  where: `"responsible_user_id" IS NOT NULL`,
})
@Index('UQ_school_week_duty_primary_flag', ['academic_year', 'day_of_week'], {
  unique: true,
  where: `kind = 'FLAG' AND cycle = 'PRIMAIRE'`,
})
@Index('UQ_school_week_duty_manual_slot', [
  'academic_year',
  'kind',
  'cycle',
  'day_of_week',
  'manual_name',
], {
  unique: true,
  where: `"manual_name" IS NOT NULL`,
})
export class SchoolWeekDuty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  academic_year: string;

  /** ACCUEIL | FLAG | ANIMATION | SERVICE | DEVOTION | DEFI | PRIERE */
  @Column({ type: 'varchar', length: 20 })
  kind: SchoolDutyKind;

  /** PRESCOLAIRE | PRIMAIRE */
  @Column({ type: 'varchar', length: 20, nullable: true })
  cycle: MorningDutyCycle | null;

  @Column({ type: 'smallint' })
  day_of_week: number;

  @Column({ type: 'varchar', length: 5 })
  start_time: string;

  @Column({ type: 'varchar', length: 5 })
  end_time: string;

  @Column({ type: 'int', nullable: true })
  responsible_user_id: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'responsible_user_id' })
  responsible: User | null;

  @Column({ type: 'uuid', nullable: true })
  class_id: string | null;

  @ManyToOne(() => Class, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'class_id' })
  class: Class | null;

  /** Dames de service / prière midi : saisi à la main, PDF seulement. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  manual_name: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
