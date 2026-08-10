import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Class } from '../classes/class.entity';
import { Student } from '../students/student.entity';

@Entity('room')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  /** Effectif max (null = illimité). */
  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  /** Classe pédagogique (ex. 1ère année) — une classe a plusieurs salles. */
  @ManyToOne(() => Class, (cls) => cls.rooms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'class_id' })
  class: Class | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Student, (s) => s.room)
  students: Student[];
}
