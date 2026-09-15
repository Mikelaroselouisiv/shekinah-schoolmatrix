import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Class } from '../classes/class.entity';
import { Subject } from '../subjects/subject.entity';
import { User } from '../users/user.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { HomeworkGrade } from './homework-grade.entity';

export type HomeworkKind = 'DEVOIR' | 'LECON';

@Entity('homework_assignment')
export class HomeworkAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12 })
  kind: HomeworkKind;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({ type: 'date', nullable: true })
  due_date: string | null;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @ManyToOne(() => Subject, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'teacher_id' })
  teacher: User | null;

  @ManyToOne(() => AcademicYear, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'academic_year_id' })
  academic_year: AcademicYear | null;

  @OneToMany(() => HomeworkGrade, (g) => g.assignment)
  grades: HomeworkGrade[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
