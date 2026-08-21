import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * sync_tombstone v2 : la table devient elle-même une entité répliquée
 * (id uuid + updated_at pour le curseur de pull).
 *
 * Conversion en place, sans perte : `entity_type` est RENOMMÉE en
 * `entity_name` (les lignes existantes conservent donc leur valeur) et
 * `updated_at` est initialisée à `deleted_at`.
 */
export class SyncTombstoneV21739000000017 implements MigrationInterface {
  name = 'SyncTombstoneV21739000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Installation neuve : table directement au format v2.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_tombstone" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "entity_name" character varying(128) NOT NULL,
        "entity_id" character varying(255) NOT NULL,
        "deleted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sync_tombstone_id" PRIMARY KEY ("id")
      )
    `);

    // Existant v1 : entity_type → entity_name (aucune ligne réécrite).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sync_tombstone'
            AND column_name = 'entity_type'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sync_tombstone'
            AND column_name = 'entity_name'
        ) THEN
          ALTER TABLE "sync_tombstone" RENAME COLUMN "entity_type" TO "entity_name";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sync_tombstone'
            AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE "sync_tombstone"
            ADD COLUMN "updated_at" TIMESTAMP WITH TIME ZONE;
          UPDATE "sync_tombstone" SET "updated_at" = "deleted_at"
            WHERE "updated_at" IS NULL;
          ALTER TABLE "sync_tombstone"
            ALTER COLUMN "updated_at" SET DEFAULT now(),
            ALTER COLUMN "updated_at" SET NOT NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sync_tombstone'
            AND column_name = 'created_at'
        ) THEN
          ALTER TABLE "sync_tombstone"
            ADD COLUMN "created_at" TIMESTAMP WITH TIME ZONE;
          UPDATE "sync_tombstone" SET "created_at" = "deleted_at"
            WHERE "created_at" IS NULL;
          ALTER TABLE "sync_tombstone"
            ALTER COLUMN "created_at" SET DEFAULT now(),
            ALTER COLUMN "created_at" SET NOT NULL;
        END IF;
      END $$;
    `);

    // Nouvelle PK technique : l'ancienne (entity_type, entity_id) devient
    // une contrainte d'unicité, ce qui préserve la garantie « un tombstone
    // par entité » tout en donnant un id réplicable.
    await queryRunner.query(`
      DO $$
      DECLARE
        pk_name text;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sync_tombstone'
            AND column_name = 'id'
        ) THEN
          SELECT con.conname INTO pk_name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE rel.relname = 'sync_tombstone'
            AND nsp.nspname = current_schema()
            AND con.contype = 'p';

          IF pk_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE "sync_tombstone" DROP CONSTRAINT %I', pk_name);
          END IF;

          ALTER TABLE "sync_tombstone"
            ADD COLUMN "id" uuid NOT NULL DEFAULT gen_random_uuid();
          ALTER TABLE "sync_tombstone"
            ADD CONSTRAINT "PK_sync_tombstone_id" PRIMARY KEY ("id");
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sync_tombstone_entity_deleted"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sync_tombstone_entity"
        ON "sync_tombstone" ("entity_name", "entity_id")
    `);
    // Curseur de pull.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sync_tombstone_updated_at"
        ON "sync_tombstone" ("updated_at", "id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sync_tombstone_updated_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sync_tombstone_entity"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sync_tombstone'
            AND column_name = 'id'
        ) THEN
          ALTER TABLE "sync_tombstone" DROP CONSTRAINT IF EXISTS "PK_sync_tombstone_id";
          ALTER TABLE "sync_tombstone" DROP COLUMN "id";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sync_tombstone'
            AND column_name = 'entity_name'
        ) THEN
          ALTER TABLE "sync_tombstone" RENAME COLUMN "entity_name" TO "entity_type";
        END IF;
        ALTER TABLE "sync_tombstone" DROP COLUMN IF EXISTS "updated_at";
        ALTER TABLE "sync_tombstone" DROP COLUMN IF EXISTS "created_at";
        ALTER TABLE "sync_tombstone"
          ADD CONSTRAINT "PK_sync_tombstone" PRIMARY KEY ("entity_type", "entity_id");
      END $$;
    `);
  }
}
