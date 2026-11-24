import { MigrationInterface, QueryRunner } from 'typeorm';

export class YearEndThresholds1739000000041 implements MigrationInterface {
  name = 'YearEndThresholds1739000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_decision_threshold"
      ADD COLUMN IF NOT EXISTS "min_average_cas_special" decimal(6,2) NOT NULL DEFAULT 4
    `);
    await queryRunner.query(`
      UPDATE "class_decision_threshold"
      SET "min_average_cas_special" = ROUND(
        (("min_average_admis"::numeric + "min_average_redoubler"::numeric) / 2)::numeric,
        2
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "student_class_assignment"
      ADD COLUMN IF NOT EXISTS "decision_manual" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "student_class_assignment" DROP COLUMN IF EXISTS "decision_manual"
    `);
    await queryRunner.query(`
      ALTER TABLE "class_decision_threshold" DROP COLUMN IF EXISTS "min_average_cas_special"
    `);
  }
}
