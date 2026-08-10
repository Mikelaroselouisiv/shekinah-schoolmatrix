import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { Class } from '../classes/class.entity';

@Entity('lateness')
export class Lateness {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'varchar', length: 5 })
  arrival_time: string;

  @CreateDateColumn()
  created_at: Date;
}
