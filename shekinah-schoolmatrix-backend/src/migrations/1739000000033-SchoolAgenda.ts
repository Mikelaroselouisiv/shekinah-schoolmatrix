import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolAgenda1739000000033 implements MigrationInterface {
  name = 'SchoolAgenda1739000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extracurricular_activity"
        ADD COLUMN IF NOT EXISTS "objective" character varying(500),
        ADD COLUMN IF NOT EXISTS "parents_concerned" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "contribution_due_date" date,
        ADD COLUMN IF NOT EXISTS "location_kind" character varying(20) NOT NULL DEFAULT 'SCHOOL',
        ADD COLUMN IF NOT EXISTS "location_text" character varying(200)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parent_meeting" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "academic_year_id" uuid NOT NULL,
        "meeting_date" date NOT NULL,
        "start_time" character varying(5) NOT NULL,
        "class_id" uuid NOT NULL,
        "objective" character varying(500) NOT NULL,
        "location_kind" character varying(20) NOT NULL DEFAULT 'SCHOOL',
        "location_text" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_parent_meeting" PRIMARY KEY ("id"),
        CONSTRAINT "FK_parent_meeting_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_parent_meeting_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_parent_meeting_year_date"
        ON "parent_meeting" ("academic_year_id", "meeting_date")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_period" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "academic_year_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "period_name" character varying(80) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "report_date" date,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_period" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_exam_period_dates" CHECK ("end_date" >= "start_date"),
        CONSTRAINT "FK_exam_period_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_period_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_exam_period_year_class"
        ON "exam_period" ("academic_year_id", "class_id", "start_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "exam_period"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parent_meeting"`);
    await queryRunner.query(`
      ALTER TABLE "extracurricular_activity"
        DROP COLUMN IF EXISTS "location_text",
        DROP COLUMN IF EXISTS "location_kind",
        DROP COLUMN IF EXISTS "contribution_due_date",
        DROP COLUMN IF EXISTS "parents_concerned",
        DROP COLUMN IF EXISTS "objective"
    `);
  }
}
