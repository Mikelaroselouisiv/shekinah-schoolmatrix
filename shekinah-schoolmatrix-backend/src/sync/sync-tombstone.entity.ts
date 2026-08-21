/**
 * Tombstone de sync : trace une suppression hard pour la propager
 * Server ↔ Cloud (last-write-wins sur deleted_at vs updated_at cible).
 *
 * La table est elle-même une entité répliquée : d'où `id` + `updated_at`,
 * indispensables au curseur de pull.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('sync_tombstone')
@Index('UQ_sync_tombstone_entity', ['entity_name', 'entity_id'], {
  unique: true,
})
export class SyncTombstone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nom filaire sync (ex. Student, User). */
  @Column({ type: 'varchar', length: 128 })
  entity_name: string;

  /** PK métier en string (uuid ou id numérique). */
  @Column({ type: 'varchar', length: 255 })
  entity_id: string;

  @Column({ type: 'timestamptz' })
  deleted_at: Date;

  /** Curseur pull (aligné sur deleted_at à l’écriture). */
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
