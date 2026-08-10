import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée la table file_metadata pour les métadonnées des fichiers.
 */
export class FileMetadata1739000000001 implements MigrationInterface {
  name = 'FileMetadata1739000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS file_metadata (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        local_path VARCHAR(512) NOT NULL,
        s3_key VARCHAR(1024),
        sync_status VARCHAR(32) DEFAULT 'local_only',
        checksum VARCHAR(64),
        last_synced_at TIMESTAMP,
        original_filename VARCHAR(255),
        mime_type VARCHAR(128),
        size_bytes BIGINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_file_metadata_sync_status ON file_metadata(sync_status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS file_metadata`);
  }
}
