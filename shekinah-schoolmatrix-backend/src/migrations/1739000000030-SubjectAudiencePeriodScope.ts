import { MigrationInterface, QueryRunner } from 'typeorm';

/** Shekinah : colonnes audience/scope uniquement. Pas de seed bulletin Eureka. */
export class SubjectAudiencePeriodScope1739000000030
  implements MigrationInterface
{
  name = 'SubjectAudiencePeriodScope1739000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subject"
        ADD COLUMN IF NOT EXISTS "audience" varchar(32) NOT NULL DEFAULT 'PRIMAIRE'
    `);
    await queryRunner.query(`
      ALTER TABLE "subject"
        ADD COLUMN IF NOT EXISTS "section" varchar(128)
    `);
    await queryRunner.query(`
      ALTER TABLE "period"
        ADD COLUMN IF NOT EXISTS "scope" varchar(20) NOT NULL DEFAULT 'ECOLE'
    `);
    await queryRunner.query(`
      ALTER TABLE "period"
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      UPDATE "period"
      SET "updated_at" = COALESCE("created_at", now())
      WHERE "updated_at" IS NULL OR "updated_at" = "created_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "school_profile"
        ADD COLUMN IF NOT EXISTS "current_preschool_period_id" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "school_profile" DROP COLUMN IF EXISTS "current_preschool_period_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "period" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "period" DROP COLUMN IF EXISTS "scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subject" DROP COLUMN IF EXISTS "section"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subject" DROP COLUMN IF EXISTS "audience"`,
    );
  }
}
