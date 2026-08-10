import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalise les NISU (order_number) et garantit l'unicité en base.
 * En cas de doublons historiques après normalisation, seul le plus ancien
 * conserve le NISU ; les autres reçoivent un suffixe -CONFLIT- pour
 * débloquer la contrainte (à corriger manuellement si besoin).
 */
export class NormalizeStudentNisuUnique1739000000010 implements MigrationInterface {
  name = 'NormalizeStudentNisuUnique1739000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "student"
      SET "order_number" = UPPER(REGEXP_REPLACE(TRIM("order_number"), '[[:space:]]+', '', 'g'))
      WHERE "order_number" IS NOT NULL AND TRIM("order_number") <> ''
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          "id",
          "order_number",
          ROW_NUMBER() OVER (
            PARTITION BY "order_number"
            ORDER BY "created_at" ASC NULLS LAST, "id" ASC
          ) AS rn
        FROM "student"
        WHERE "order_number" IS NOT NULL AND TRIM("order_number") <> ''
      )
      UPDATE "student" s
      SET "order_number" = r."order_number" || '-CONFLIT-' || LEFT(REPLACE(s."id"::text, '-', ''), 8)
      FROM ranked r
      WHERE s."id" = r."id" AND r.rn > 1
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_student_order_number'
        ) THEN
          ALTER TABLE "student"
            ADD CONSTRAINT "UQ_student_order_number" UNIQUE ("order_number");
        END IF;
      END $$
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible data normalization — contrainte unique déjà attendue historiquement.
  }
}
