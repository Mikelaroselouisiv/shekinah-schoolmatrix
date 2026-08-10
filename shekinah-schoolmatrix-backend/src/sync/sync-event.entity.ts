/**
 * Événement de synchronisation.
 * Trace l'origine d'une écriture synchronisable pour future sync asynchrone.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('sync_events')
export class SyncEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  node_id: string;

  @Column({ type: 'varchar', length: 128 })
  entity_type: string;

  @Column({ type: 'varchar', length: 255 })
  entity_id: string;

  @Column({ type: 'varchar', length: 32 })
  event_type: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null = null;

  @CreateDateColumn()
  created_at: Date;
}
