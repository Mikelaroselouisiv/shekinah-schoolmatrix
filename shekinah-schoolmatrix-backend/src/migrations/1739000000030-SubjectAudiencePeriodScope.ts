import { MigrationInterface, QueryRunner } from 'typeorm';
import { PRESCHOOL_BULLETIN_SUBJECTS } from '../subjects/preschool-bulletin.seed';

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

    for (const s of PRESCHOOL_BULLETIN_SUBJECTS) {
      await queryRunner.query(
        `
        INSERT INTO "subject"
          ("id", "name", "code", "active", "preschool_eval", "audience", "section", "created_at", "updated_at")
        SELECT $1::uuid, $2::varchar, NULL, true, $3::varchar, 'PRESCOLAIRE', $4::varchar, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM "subject" WHERE "id" = $1::uuid)
          AND NOT EXISTS (
            SELECT 1 FROM "subject"
            WHERE "name" = $2::varchar AND "audience" = 'PRESCOLAIRE'
          )
        `,
        [s.id, s.name, s.preschool_eval, s.section],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ids = PRESCHOOL_BULLETIN_SUBJECTS.map((s) => `'${s.id}'`).join(',');
    if (ids) {
      await queryRunner.query(
        `DELETE FROM "subject" WHERE "id" IN (${ids})`,
      );
    }
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
