import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tombstones sync : suppressions dures propagées Server ↔ Cloud (anti-résurrection).
 */
export class SyncTombstone1739000000013 implements MigrationInterface {
  name = 'SyncTombstone1739000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_tombstone" (
        "entity_type" character varying(128) NOT NULL,
        "entity_id" character varying(255) NOT NULL,
        "deleted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_sync_tombstone" PRIMARY KEY ("entity_type", "entity_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sync_tombstone_entity_deleted"
        ON "sync_tombstone" ("entity_type", "deleted_at", "entity_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sync_tombstone_entity_deleted"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_tombstone"`);
  }
}
