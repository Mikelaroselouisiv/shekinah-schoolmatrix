/**
 * Métadonnées de stockage des fichiers.
 * local + cloud (GCS prioritaire ; colonne s3_key = clé objet remote).
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SyncStatus = 'pending' | 'synced' | 'failed' | 'local_only';

@Entity('file_metadata')
export class FileMetadata {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 512 })
  local_path: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  s3_key: string | null = null;

  @Column({ type: 'varchar', length: 32, default: 'local_only' })
  sync_status: SyncStatus = 'local_only';

  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum: string | null = null;

  @Column({ type: 'timestamp', nullable: true })
  last_synced_at: Date | null = null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  original_filename: string | null = null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mime_type: string | null = null;

  @Column({ type: 'bigint', default: 0 })
  size_bytes: number = 0;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
