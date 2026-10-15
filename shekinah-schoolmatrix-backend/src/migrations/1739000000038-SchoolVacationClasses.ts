import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolVacationClasses1739000000038 implements MigrationInterface {
  name = 'SchoolVacationClasses1739000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_vacation"
        ADD COLUMN IF NOT EXISTS "class_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "school_vacation" v
      SET "class_id" = r."class_id"
      FROM "room" r
      WHERE v."room_id" IS NOT NULL
        AND v."room_id" = r."id"
        AND v."class_id" IS NULL
        AND r."class_id" IS NOT NULL
    `);
    await queryRunner.query(`
      DELETE FROM "school_vacation" a
      USING "school_vacation" b
      WHERE a."id" > b."id"
        AND a."class_id" IS NOT NULL
        AND a."class_id" = b."class_id"
        AND a."academic_year_id" = b."academic_year_id"
        AND a."start_date" = b."start_date"
        AND a."end_date" = b."end_date"
        AND COALESCE(a."kind", 'VACANCE') = COALESCE(b."kind", 'VACANCE')
        AND LOWER(TRIM(a."motif")) = LOWER(TRIM(b."motif"))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_vacation_class"
        ON "school_vacation" ("class_id")
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "school_vacation"
          ADD CONSTRAINT "FK_school_vacation_class"
          FOREIGN KEY ("class_id") REFERENCES "class"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "school_vacation" DROP CONSTRAINT IF EXISTS "FK_school_vacation_room"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_school_vacation_room"`);
    await queryRunner.query(`
      ALTER TABLE "school_vacation" DROP COLUMN IF EXISTS "room_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_vacation"
        ADD COLUMN IF NOT EXISTS "room_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "school_vacation" DROP CONSTRAINT IF EXISTS "FK_school_vacation_class"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_school_vacation_class"`);
    await queryRunner.query(`
      ALTER TABLE "school_vacation" DROP COLUMN IF EXISTS "class_id"
    `);
  }
}
