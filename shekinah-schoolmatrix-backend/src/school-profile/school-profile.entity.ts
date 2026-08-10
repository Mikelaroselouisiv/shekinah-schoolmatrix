import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('school_profile')
export class SchoolProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  slogan: string | null = null;

  @Column({ nullable: true })
  domain: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  logo_url: string | null = null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  address: string | null = null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone: string | null = null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  email: string | null = null;

  @Column({ default: '#1e293b' })
  primary_color: string;

  @Column({ default: '#334155' })
  secondary_color: string;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'uuid', nullable: true })
  current_academic_year_id: string | null = null;

  @Column({ type: 'uuid', nullable: true })
  current_period_id: string | null = null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
