import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('fee_service')
export class FeeService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  code: string;

  @Column({ default: true })
  active: boolean;

  /** OBLIGATOIRE = paiement obligatoire (inscription, trimestre...). PARASCOLAIRE = activité à suivre (entrées/sorties). */
  @Column({ type: 'varchar', length: 20, default: 'OBLIGATOIRE' })
  nature: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
