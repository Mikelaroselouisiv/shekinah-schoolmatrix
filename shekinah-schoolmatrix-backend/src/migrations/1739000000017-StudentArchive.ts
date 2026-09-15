import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentArchive1739000000017 implements MigrationInterface {
  name = 'StudentArchive1739000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'student'
            AND column_name = 'archived_at'
        ) THEN
          ALTER TABLE "student" ADD COLUMN "archived_at" TIMESTAMP;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'student'
            AND column_name = 'archive_reason'
        ) THEN
          ALTER TABLE "student" ADD COLUMN "archive_reason" varchar(20);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_student_archived_at"
        ON "student" ("archived_at");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_student_active"
        ON "student" ("active");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_student_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_student_archived_at"`);
    await queryRunner.query(`ALTER TABLE "student" DROP COLUMN IF EXISTS "archive_reason"`);
    await queryRunner.query(`ALTER TABLE "student" DROP COLUMN IF EXISTS "archived_at"`);
  }
}
