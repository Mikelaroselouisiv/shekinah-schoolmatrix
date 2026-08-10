import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';
import { Subject } from '../subjects/subject.entity';
import { Period } from '../period/period.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';

@Entity('grade')
export class Grade {
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

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @ManyToOne(() => Period, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: Period;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  coefficient: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  grade_value: string;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
