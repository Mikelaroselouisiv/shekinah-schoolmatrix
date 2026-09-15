import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tombstones de sync — propagation des suppressions local ↔ cloud. */
export class SyncTombstone1739000000012 implements MigrationInterface {
  name = 'SyncTombstone1739000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_tombstone" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entity_name" character varying(128) NOT NULL,
        "entity_id" character varying(255) NOT NULL,
        "deleted_at" TIMESTAMPTZ NOT NULL,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sync_tombstone_entity"
      ON "sync_tombstone" ("entity_name", "entity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sync_tombstone_updated_at"
      ON "sync_tombstone" ("updated_at", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sync_tombstone_updated_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sync_tombstone_entity"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_tombstone"`);
  }
}
