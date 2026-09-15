import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshToken1739000000014 implements MigrationInterface {
  name = 'RefreshToken1739000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_token" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" integer NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "family_id" uuid NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked_at" TIMESTAMP,
        "revoked_reason" character varying(40),
        "last_used_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_token" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_token_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_token_token_hash"
        ON "refresh_token" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_token_user_id"
        ON "refresh_token" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_token_family_id"
        ON "refresh_token" ("family_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_token_family_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_token_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_token_token_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_token"`);
  }
}
