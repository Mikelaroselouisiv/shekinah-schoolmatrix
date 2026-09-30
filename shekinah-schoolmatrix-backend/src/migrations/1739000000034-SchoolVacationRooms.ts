import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolVacationRooms1739000000034 implements MigrationInterface {
  name = 'SchoolVacationRooms1739000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_vacation"
        ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'VACANCE',
        ADD COLUMN IF NOT EXISTS "room_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_vacation_room"
        ON "school_vacation" ("room_id")
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "school_vacation"
          ADD CONSTRAINT "FK_school_vacation_room"
          FOREIGN KEY ("room_id") REFERENCES "room"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_vacation" DROP CONSTRAINT IF EXISTS "FK_school_vacation_room"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_school_vacation_room"`);
    await queryRunner.query(`
      ALTER TABLE "school_vacation"
        DROP COLUMN IF EXISTS "room_id",
        DROP COLUMN IF EXISTS "kind"
    `);
  }
}
