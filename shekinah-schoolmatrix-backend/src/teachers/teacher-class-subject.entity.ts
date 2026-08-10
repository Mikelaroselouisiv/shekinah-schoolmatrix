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
import { Class } from '../classes/class.entity';
import { User } from '../users/user.entity';
import { Room } from '../rooms/room.entity';

/**
 * Assignation : ce professeur enseigne cette matière dans cette salle (section).
 * La salle appartient à une classe pédagogique (ex. 1ère année → salles 1, 2, 3).
 */
@Entity('teacher_class_subject')
@Unique(['teacher_id', 'class_id', 'subject_id', 'room_id'])
export class TeacherClassSubject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  teacher_id: number;

  @Column({ type: 'uuid' })
  class_id: string;

  @Column({ type: 'uuid' })
  subject_id: string;

  /** Salle / section (ex. 1ère année 2). */
  @Column({ type: 'uuid', nullable: true })
  room_id: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_id' })
  teacher: User;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @ManyToOne(() => Room, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'room_id' })
  room: Room | null;

  @CreateDateColumn()
  created_at: Date;
}
