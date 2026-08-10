/**
 * Nœud de synchronisation (LOCAL ou CLOUD).
 * Fondation pour future synchronisation asynchrone.
 */
import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sync_nodes')
export class SyncNode {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @CreateDateColumn()
  created_at: Date;
}
