import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Exercice comptable : période de clôture (ex. 01/09/2024 - 31/08/2025). */
@Entity('exercice')
export class Exercice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  date_debut: string;

  @Column({ type: 'date' })
  date_fin: string;

  @Column({ type: 'varchar', length: 50, default: 'OUVERT' })
  statut: string; // OUVERT | CLOTURE

  @Column({ type: 'date', nullable: true })
  date_cloture: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
