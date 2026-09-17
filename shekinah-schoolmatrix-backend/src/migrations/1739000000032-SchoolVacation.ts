import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolVacation1739000000032 implements MigrationInterface {
  name = 'SchoolVacation1739000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_vacation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "academic_year_id" uuid NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "motif" varchar(200) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_vacation" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_school_vacation_dates" CHECK ("end_date" >= "start_date")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_vacation_year_start"
        ON "school_vacation" ("academic_year_id", "start_date")
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "school_vacation"
          ADD CONSTRAINT "FK_school_vacation_academic_year"
          FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_vacation" DROP CONSTRAINT IF EXISTS "FK_school_vacation_academic_year"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "school_vacation"`);
  }
}
