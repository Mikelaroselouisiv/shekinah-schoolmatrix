import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';

@Entity('disciplinary_measure')
export class DisciplinaryMeasure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'varchar', length: 50 })
  measure_type: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  /** Pour "Renvoyé temporairement" : date/heure de fin de la mesure (après laquelle elle est retirée). */
  @Column({ type: 'timestamptz', nullable: true })
  expires_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
