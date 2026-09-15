import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Student } from '../students/student.entity';
import { User } from '../users/user.entity';

/**
 * @deprecated Aucun code n'écrit ni ne lit plus cette table.
 * Le rattachement parent → élève vit dans `user_linked_student`.
 * Entité conservée uniquement pour ne pas casser les migrations existantes ;
 * elle n'est plus enregistrée dans aucun module.
 */

@Entity('student_parent')
export class StudentParent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  parent: User;

  @Column({ nullable: true })
  relationship: string | null;

  @CreateDateColumn()
  created_at: Date;
}
