import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Code de gestion public (badge / fiche) — distinct du NISU (order_number).
 * Backfill : CG- + 8 premiers hex de l'UUID élève.
 */
export class StudentManagementCode1739000000011 implements MigrationInterface {
  name = 'StudentManagementCode1739000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "student"
      ADD COLUMN IF NOT EXISTS "management_code" character varying(50)
    `);

    await queryRunner.query(`
      UPDATE "student"
      SET "management_code" = 'CG-' || UPPER(LEFT(REPLACE("id"::text, '-', ''), 8))
      WHERE "management_code" IS NULL OR TRIM("management_code") = ''
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_student_management_code'
        ) THEN
          ALTER TABLE "student"
          ADD CONSTRAINT "UQ_student_management_code" UNIQUE ("management_code");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "student" DROP CONSTRAINT IF EXISTS "UQ_student_management_code"
    `);
    await queryRunner.query(`
      ALTER TABLE "student" DROP COLUMN IF EXISTS "management_code"
    `);
  }
}
