import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassDayLists1739000000025 implements MigrationInterface {
  name = 'ClassDayLists1739000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_bring_item"
        ADD COLUMN IF NOT EXISTS "day_of_week" smallint
    `);
    await queryRunner.query(`
      UPDATE "class_bring_item"
      SET "day_of_week" = 1
      WHERE "day_of_week" IS NULL
    `);
    await queryRunner.query(`
      INSERT INTO "class_bring_item" (
        "id", "class_id", "academic_year", "sort_order", "label",
        "day_of_week", "created_at", "updated_at"
      )
      SELECT gen_random_uuid(), "class_id", "academic_year", "sort_order", "label",
        d.day, "created_at", now()
      FROM "class_bring_item"
      CROSS JOIN (VALUES (2), (3), (4), (5)) AS d(day)
      WHERE "day_of_week" = 1
    `);
    await queryRunner.query(`
      ALTER TABLE "class_bring_item"
        ALTER COLUMN "day_of_week" SET DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "class_bring_item"
        ALTER COLUMN "day_of_week" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_class_bring_item_class_year_day"
        ON "class_bring_item" ("class_id", "academic_year", "day_of_week", "sort_order")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_day_subject" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "academic_year" varchar(20),
        "day_of_week" smallint NOT NULL,
        "subject_id" uuid NOT NULL,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_class_day_subject_class" FOREIGN KEY ("class_id")
          REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_class_day_subject_subject" FOREIGN KEY ("subject_id")
          REFERENCES "subject"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_class_day_subject_slot"
        ON "class_day_subject" ("class_id", (COALESCE("academic_year", '')), "day_of_week", "subject_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_class_day_subject_class_year_day"
        ON "class_day_subject" ("class_id", "academic_year", "day_of_week", "sort_order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "class_day_subject"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_class_bring_item_class_year_day"`);
    await queryRunner.query(`
      ALTER TABLE "class_bring_item" DROP COLUMN IF EXISTS "day_of_week"
    `);
  }
}
