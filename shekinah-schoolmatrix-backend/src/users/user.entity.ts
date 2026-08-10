import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../roles/role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  first_name: string | null;

  @Column({ nullable: true })
  last_name: string | null;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  address: string | null;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  whatsapp: string | null;

  @Column({ nullable: true })
  profile_photo_url: string | null;

  @Column({ nullable: true })
  cover_photo_url: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  order_number: string | null;

  @Column()
  password_hash: string;

  @ManyToOne(() => Role, (role) => role.users, { eager: true, nullable: false })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
