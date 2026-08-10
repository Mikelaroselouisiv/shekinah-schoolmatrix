import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SchoolProfile } from './school-profile.entity';

@Entity('school_signature')
export class SchoolSignature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  school_profile_id: string;

  @ManyToOne(() => SchoolProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_profile_id' })
  school_profile: SchoolProfile;

  /** Clé fixe (directeur_general, econome, …) ou "extra" pour les ajouts. */
  @Column({ type: 'varchar', length: 64 })
  slot_key: string;

  @Column({ type: 'varchar', length: 256, default: '' })
  signer_name: string;

  @Column({ type: 'varchar', length: 256, default: '' })
  signer_role: string;

  /** PNG (idéalement fond transparent) pour overlay sur les documents. */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  image_url: string | null = null;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
