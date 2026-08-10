import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Class } from '../classes/class.entity';
import { User } from '../users/user.entity';

@Entity('class_teacher')
@Unique(['class_id', 'user_id'])
export class ClassTeacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  class_id: string;

  @Column({ type: 'int' })
  user_id: number;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  teacher: User;

  @Column({ default: false })
  is_main: boolean;

  @CreateDateColumn()
  created_at: Date;
}
