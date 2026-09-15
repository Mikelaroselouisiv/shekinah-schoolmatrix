import { MigrationInterface, QueryRunner } from 'typeorm';

export class MorningOpeningDuties1739000000020 implements MigrationInterface {
  name = 'MorningOpeningDuties1739000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_week_duty"
        DROP CONSTRAINT IF EXISTS "UQ_school_week_duty_year_kind_day"
    `);
    await queryRunner.query(`
      ALTER TABLE "school_week_duty"
        ADD COLUMN IF NOT EXISTS "cycle" varchar(20)
    `);
    await queryRunner.query(`
      ALTER TABLE "school_week_duty"
        ADD COLUMN IF NOT EXISTS "class_id" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "school_week_duty"
          ADD CONSTRAINT "FK_school_week_duty_class"
          FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      UPDATE "school_week_duty"
      SET kind = 'RENTREE', cycle = 'PRIMAIRE'
      WHERE kind = 'DEVOTION'
    `);
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_school_week_duty_rentree_year_cycle_day_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_school_week_duty_flag_year_day"`,
    );
    await queryRunner.query(`
      UPDATE "school_week_duty"
      SET kind = 'DEVOTION', cycle = NULL
      WHERE kind = 'RENTREE'
    `);
    await queryRunner.query(`
      DELETE FROM "school_week_duty" WHERE kind = 'FLAG'
    `);
    await queryRunner.query(`
      ALTER TABLE "school_week_duty"
        DROP CONSTRAINT IF EXISTS "FK_school_week_duty_class"
    `);
    await queryRunner.query(`
      ALTER TABLE "school_week_duty" DROP COLUMN IF EXISTS "class_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "school_week_duty" DROP COLUMN IF EXISTS "cycle"
    `);
    await queryRunner.query(`
      ALTER TABLE "school_week_duty"
        ADD CONSTRAINT "UQ_school_week_duty_year_kind_day"
        UNIQUE ("academic_year", "kind", "day_of_week")
    `);
  }
}
