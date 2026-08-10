import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Subject } from '../subjects/subject.entity';
import { User } from '../users/user.entity';

@Entity('teacher_subject')
@Unique(['teacher_id', 'subject_id'])
export class TeacherSubject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  teacher_id: number;

  @Column({ type: 'uuid' })
  subject_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_id' })
  teacher: User;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @CreateDateColumn()
  created_at: Date;
}
