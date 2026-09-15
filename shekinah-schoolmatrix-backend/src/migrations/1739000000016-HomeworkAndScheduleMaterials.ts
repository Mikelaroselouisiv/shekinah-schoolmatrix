import { MigrationInterface, QueryRunner } from 'typeorm';

export class HomeworkAndScheduleMaterials1739000000016 implements MigrationInterface {
  name = 'HomeworkAndScheduleMaterials1739000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'schedule_slot'
            AND column_name = 'materials'
        ) THEN
          ALTER TABLE "schedule_slot" ADD COLUMN "materials" text;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "homework_assignment" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "kind" varchar(12) NOT NULL,
        "title" varchar(200) NOT NULL,
        "instructions" text,
        "due_date" date,
        "class_id" uuid NOT NULL REFERENCES "class"("id") ON DELETE CASCADE,
        "subject_id" uuid REFERENCES "subject"("id") ON DELETE SET NULL,
        "teacher_id" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "academic_year_id" uuid REFERENCES "academic_year"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_homework_assignment_class"
        ON "homework_assignment" ("class_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "homework_grade" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignment_id" uuid NOT NULL REFERENCES "homework_assignment"("id") ON DELETE CASCADE,
        "student_id" uuid NOT NULL REFERENCES "student"("id") ON DELETE CASCADE,
        "score" varchar(32),
        "comment" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_homework_grade_assignment_student" UNIQUE ("assignment_id", "student_id")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "homework_grade"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "homework_assignment"`);
    await queryRunner.query(
      `ALTER TABLE "schedule_slot" DROP COLUMN IF EXISTS "materials"`,
    );
  }
}
