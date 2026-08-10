import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';

export const DECISION_ADMIS = 'ADMIS';
export const DECISION_ADMIS_AILLEURS = 'ADMIS_AILLEURS';
export const DECISION_REDOUBLER = 'REDOUBLER';
export const DECISION_AJOURNE = 'AJOURNE';
export const DECISION_RENVOYE = 'RENVOYE';
export const DECISION_RENVOYE_DEFINITIVEMENT = 'RENVOYE_DEFINITIVEMENT';
export const DECISION_EXPELLED = 'EXPELLED';

@Entity('student_class_assignment')
@Unique(['student', 'academic_year'])
export class StudentClassAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academic_year: AcademicYear;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  /** ADMIS, REDOUBLER, RENVOYE, EXPELLED - null si pas encore décidé */
  @Column({ type: 'varchar', length: 30, nullable: true })
  decision: string | null;

  /** Moyenne calculée (optionnel, pour référence) */
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  average: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
