import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/** Autre revenu (don, subvention, vente...) - optionnellement lié à une activité parascolaire (fee_service.id). */
@Entity('other_revenue')
export class OtherRevenue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  revenue_date: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null; // don, subvention, vente, autre

  /** Activité parascolaire (fee_service.id) si applicable */
  @Column({ type: 'uuid', nullable: true })
  fee_service_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
