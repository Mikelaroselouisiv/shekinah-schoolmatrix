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

  /**
   * Fréquence de facturation :
   * - ONCE : montant unique (inscription, versement)
   * - MONTHLY : montant unitaire × occurrences (cantine, leçon…)
   * - TERM : montant unitaire × occurrences (trimestre)
   */
  @Column({ type: 'varchar', length: 20, default: 'ONCE' })
  billing_frequency: string;

  /**
   * Nombre d’échéances (null = défaut selon fréquence : ONCE=1, MONTHLY=10, TERM=3).
   * Le montant sur class_fee est le montant **par** échéance.
   */
  @Column({ type: 'int', nullable: true })
  billing_occurrences: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
