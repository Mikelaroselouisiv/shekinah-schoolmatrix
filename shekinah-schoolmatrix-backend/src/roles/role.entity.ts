import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('role')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description: string | null;

  @Column({ type: 'simple-json', nullable: true })
  permissions: string[] | null = null;

  /** Niveaux d’enseignement visibles. `null` = pas de restriction. */
  @Column({ type: 'simple-json', nullable: true })
  education_levels: string[] | null = null;

  @OneToMany(() => User, (user) => user.role)
  users: User[];
}
