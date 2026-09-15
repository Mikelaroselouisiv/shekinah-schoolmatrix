import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('subject')
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  code: string;

  @Column({ default: true })
  active: boolean;

  /** PRESCOLAIRE | PRIMAIRE | SECONDAIRE | FORMATION_SUPERIEURE */
  @Column({ type: 'varchar', length: 32, default: 'PRIMAIRE' })
  audience: string;

  /** Rubrique du bulletin (préscolaire). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  section: string | null;

  /** LEVEL = EX / TB / B / AB. FREQUENCY = TJ / SO / PF / JA. */
  @Column({ type: 'varchar', length: 20, default: 'LEVEL' })
  preschool_eval: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
