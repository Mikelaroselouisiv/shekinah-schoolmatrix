import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduleDayMoments1739000000018 implements MigrationInterface {
  name = 'ScheduleDayMoments1739000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_day_moment" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL REFERENCES "class"("id") ON DELETE CASCADE,
        "academic_year" varchar(20),
        "kind" varchar(20) NOT NULL,
        "day_of_week" smallint NOT NULL,
        "start_time" varchar(5) NOT NULL,
        "end_time" varchar(5) NOT NULL,
        "label" varchar(80),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_class_day_moment_class_year"
        ON "class_day_moment" ("class_id", "academic_year");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_week_duty" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "academic_year" varchar(20) NOT NULL,
        "kind" varchar(20) NOT NULL,
        "day_of_week" smallint NOT NULL,
        "start_time" varchar(5) NOT NULL,
        "end_time" varchar(5) NOT NULL,
        "responsible_user_id" int REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_school_week_duty_year_kind_day"
          UNIQUE ("academic_year", "kind", "day_of_week")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "school_week_duty"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "class_day_moment"`);
  }
}
