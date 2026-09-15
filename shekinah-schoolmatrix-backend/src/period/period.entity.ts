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

@Entity('period')
export class Period {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academic_year: AcademicYear;

  @Column()
  name: string;

  @Column({ type: 'smallint', default: 0 })
  order_index: number;

  /** PRESCOLAIRE | ECOLE */
  @Column({ type: 'varchar', length: 20, default: 'ECOLE' })
  scope: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
