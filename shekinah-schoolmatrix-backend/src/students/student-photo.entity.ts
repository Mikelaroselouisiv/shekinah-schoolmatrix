import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Student } from './student.entity';

/** Types de photos gérés dans l’onglet Photographie. */
export type StudentPhotoKind =
  | 'profile'
  | 'identity'
  | 'souvenir'
  | 'promotion'
  | 'other';

@Entity('student_photo')
export class StudentPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  student_id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'varchar', length: 40 })
  kind: StudentPhotoKind;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
