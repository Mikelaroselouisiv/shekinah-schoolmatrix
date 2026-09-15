import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { MorningDutyCycle } from '../roles/education-levels';

@Entity('school_opening_instruction')
@Index('IDX_school_opening_instruction_year_cycle', ['academic_year', 'cycle', 'sort_order'])
export class SchoolOpeningInstruction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  academic_year: string;

  @Column({ type: 'varchar', length: 20 })
  cycle: MorningDutyCycle;

  @Column({ type: 'smallint', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 240 })
  text: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
