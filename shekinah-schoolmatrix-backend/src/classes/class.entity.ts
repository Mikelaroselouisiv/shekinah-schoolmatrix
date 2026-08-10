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
import { Student } from '../students/student.entity';
import { Room } from '../rooms/room.entity';

@Entity('class')
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  level: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  section: string;

  /** @deprecated Preférer room.class_id (plusieurs salles par classe). Conservé pour compat. */
  @ManyToOne(() => Room, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Student, (student) => student.class)
  students: Student[];

  @OneToMany(() => Room, (room) => room.class)
  rooms: Room[];
}
