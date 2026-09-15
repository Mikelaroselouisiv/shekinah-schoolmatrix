import { MigrationInterface, QueryRunner } from 'typeorm';

export class MorningOpeningRubrics1739000000024 implements MigrationInterface {
  name = 'MorningOpeningRubrics1739000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_week_duty"
        ADD COLUMN IF NOT EXISTS "manual_name" varchar(120)
    `);

    await queryRunner.query(`
      UPDATE "school_week_duty"
      SET kind = 'ACCUEIL', cycle = 'PRESCOLAIRE'
      WHERE kind = 'RENTREE' AND cycle = 'PRESCOLAIRE'
    `);
    await queryRunner.query(`
      UPDATE "school_week_duty"
      SET kind = 'ACCUEIL', cycle = 'PRIMAIRE'
      WHERE kind IN ('RENTREE', 'DEVOTION') AND (cycle IS NULL OR cycle = 'PRIMAIRE')
    `);
    await queryRunner.query(`
      UPDATE "school_week_duty"
      SET cycle = 'PRIMAIRE'
      WHERE kind = 'FLAG' AND cycle IS NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_school_week_duty_flag_year_day"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_school_week_duty_rentree_year_cycle_day_user"`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_school_week_duty_user_slot"
        ON "school_week_duty" ("academic_year", "kind", "cycle", "day_of_week", "responsible_user_id")
        WHERE "responsible_user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_school_week_duty_primary_flag"
        ON "school_week_duty" ("academic_year", "day_of_week")
        WHERE kind = 'FLAG' AND cycle = 'PRIMAIRE'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_school_week_duty_manual_slot"
        ON "school_week_duty" ("academic_year", "kind", "cycle", "day_of_week", "manual_name")
        WHERE "manual_name" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_opening_instruction" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "academic_year" varchar(20) NOT NULL,
        "cycle" varchar(20) NOT NULL,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "text" varchar(240) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_opening_instruction_year_cycle"
        ON "school_opening_instruction" ("academic_year", "cycle", "sort_order")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_bring_item" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "academic_year" varchar(20),
        "sort_order" smallint NOT NULL DEFAULT 0,
        "label" varchar(160) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_class_bring_item_class" FOREIGN KEY ("class_id")
          REFERENCES "class"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_class_bring_item_class_year"
        ON "class_bring_item" ("class_id", "academic_year", "sort_order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "class_bring_item"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "school_opening_instruction"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_school_week_duty_manual_slot"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_school_week_duty_primary_flag"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_school_week_duty_user_slot"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_school_week_duty_flag_year_day"
        ON "school_week_duty" ("academic_year", "day_of_week")
        WHERE kind = 'FLAG'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_school_week_duty_rentree_year_cycle_day_user"
        ON "school_week_duty" ("academic_year", "cycle", "day_of_week", "responsible_user_id")
        WHERE kind = 'RENTREE'
    `);
    await queryRunner.query(`
      ALTER TABLE "school_week_duty" DROP COLUMN IF EXISTS "manual_name"
    `);
  }
}
