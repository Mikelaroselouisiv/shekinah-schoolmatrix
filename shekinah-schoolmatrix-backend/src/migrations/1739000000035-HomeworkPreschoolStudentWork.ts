import { MigrationInterface, QueryRunner } from 'typeorm';

export class HomeworkPreschoolStudentWork1739000000035 implements MigrationInterface {
  name = 'HomeworkPreschoolStudentWork1739000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "homework_grade"
        ADD COLUMN IF NOT EXISTS "included" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "source" varchar(12),
        ADD COLUMN IF NOT EXISTS "content" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "homework_grade"
        DROP COLUMN IF EXISTS "content",
        DROP COLUMN IF EXISTS "source",
        DROP COLUMN IF EXISTS "included"
    `);
  }
}
