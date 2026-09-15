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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
