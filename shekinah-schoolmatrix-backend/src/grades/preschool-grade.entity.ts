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

@Entity('preschool_grade')
export class PreschoolGrade {
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

  @Column({ type: 'varchar', length: 20, nullable: true })
  level: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  frequency: string | null;

  @Column({ type: 'text', nullable: true })
  observation: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
