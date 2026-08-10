import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { FeeService } from './fee-service.entity';

@Entity('student_service_exemption')
export class StudentServiceExemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'varchar', length: 20 })
  academic_year: string;

  @ManyToOne(() => FeeService, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: FeeService;

  @Column({ type: 'varchar', length: 10 })
  exemption_type: string;

  @CreateDateColumn()
  created_at: Date;
}
