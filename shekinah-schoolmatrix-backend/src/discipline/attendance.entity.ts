import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';

@Entity('attendance')
@Unique(['class', 'student', 'date'])
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'varchar', length: 10 })
  status: string;

  @CreateDateColumn()
  created_at: Date;
}
