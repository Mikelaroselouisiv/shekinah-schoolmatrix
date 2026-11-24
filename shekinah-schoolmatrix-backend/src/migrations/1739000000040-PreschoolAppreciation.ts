import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreschoolAppreciation1739000000040 implements MigrationInterface {
  name = 'PreschoolAppreciation1739000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "preschool_appreciation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "period_id" uuid NOT NULL,
        "text" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_preschool_appreciation" PRIMARY KEY ("id"),
        CONSTRAINT "FK_preschool_appreciation_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_preschool_appreciation_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_preschool_appreciation_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_preschool_appreciation_period" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_preschool_appreciation_student_period"
      ON "preschool_appreciation" ("student_id", "academic_year_id", "period_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "preschool_appreciation"`);
  }
}
