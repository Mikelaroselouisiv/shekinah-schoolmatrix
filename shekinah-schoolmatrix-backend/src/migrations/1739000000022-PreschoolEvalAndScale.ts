import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreschoolEvalAndScale1739000000022 implements MigrationInterface {
  name = 'PreschoolEvalAndScale1739000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subject"
      ADD COLUMN IF NOT EXISTS "preschool_eval" varchar(20) NOT NULL DEFAULT 'LEVEL'
    `);
    await queryRunner.query(`
      UPDATE "subject"
      SET "preschool_eval" = 'FREQUENCY'
      WHERE UPPER(COALESCE("code", '')) = 'EPS'
    `);
    await queryRunner.query(`
      UPDATE "preschool_grade"
      SET "level" = CASE
        WHEN "level" IS NULL OR BTRIM("level") = '' THEN NULL
        WHEN UPPER(REPLACE(REPLACE(BTRIM("level"), ' ', '_'), '-', '_')) IN ('NA', 'MOINS_BIEN') THEN 'MOINS_BIEN'
        WHEN UPPER(BTRIM("level")) IN ('A', 'BIEN') THEN 'BIEN'
        WHEN UPPER(REPLACE(REPLACE(BTRIM("level"), ' ', '_'), '-', '_')) IN ('EA', 'AB', 'TRES_BIEN') THEN 'TRES_BIEN'
        WHEN UPPER(BTRIM("level")) IN ('E', 'EXCELLENT') THEN 'EXCELLENT'
        ELSE "level"
      END
    `);
    await queryRunner.query(`
      UPDATE "preschool_grade"
      SET "frequency" = CASE
        WHEN "frequency" IS NULL OR BTRIM("frequency") = '' THEN NULL
        WHEN LOWER(BTRIM("frequency")) IN ('jamais') THEN 'JAMAIS'
        WHEN LOWER(BTRIM("frequency")) IN ('parfois', 'occasionnel', 'en progrès', 'en progres') THEN 'PARFOIS'
        WHEN LOWER(BTRIM("frequency")) IN ('toujours', 'régulier', 'regulier') THEN 'TOUJOURS'
        ELSE "frequency"
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subject" DROP COLUMN IF EXISTS "preschool_eval"`);
  }
}
