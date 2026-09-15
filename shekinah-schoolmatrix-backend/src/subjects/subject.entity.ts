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

  /** LEVEL = Bien / Moins bien / Très bien / Excellent. FREQUENCY = Jamais / Parfois / Toujours. */
  @Column({ type: 'varchar', length: 20, default: 'LEVEL' })
  preschool_eval: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
