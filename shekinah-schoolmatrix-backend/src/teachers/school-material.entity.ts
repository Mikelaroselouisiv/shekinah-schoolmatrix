import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Subject } from '../subjects/subject.entity';

export const SCHOOL_MATERIAL_KINDS = ['LIVRE', 'CAHIER'] as const;
export type SchoolMaterialKind = (typeof SCHOOL_MATERIAL_KINDS)[number];

/** Catalogue livres / cahiers à apporter (primaire). */
@Entity('school_material')
@Unique('UQ_school_material_kind_name', ['kind', 'name'])
export class SchoolMaterial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  kind: SchoolMaterialKind;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  subject_id: string | null;

  @ManyToOne(() => Subject, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
