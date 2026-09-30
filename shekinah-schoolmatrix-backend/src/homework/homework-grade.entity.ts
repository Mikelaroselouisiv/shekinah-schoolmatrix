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
import { HomeworkAssignment } from './homework-assignment.entity';
import { Student } from '../students/student.entity';

@Entity('homework_grade')
@Unique(['assignment', 'student'])
export class HomeworkGrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => HomeworkAssignment, (a) => a.grades, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: HomeworkAssignment;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'varchar', length: 32, nullable: true })
  score: string | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  /** Préscolaire : l’élève fait partie de ce devoir. */
  @Column({ type: 'boolean', default: true })
  included: boolean;

  /** Préscolaire : LIVRE ou PHRASE. */
  @Column({ type: 'varchar', length: 12, nullable: true })
  source: 'LIVRE' | 'PHRASE' | null;

  /** Préscolaire : titre du livre ou phrase à écrire / lire. */
  @Column({ type: 'text', nullable: true })
  content: string | null;

  /** Préscolaire : PASSE, A_REFAIRE ou A_RELIRE. Vide si non renseigné. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  result: 'PASSE' | 'A_REFAIRE' | 'A_RELIRE' | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
