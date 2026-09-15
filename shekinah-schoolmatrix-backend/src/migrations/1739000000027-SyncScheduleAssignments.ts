import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncScheduleAssignments1739000000027 implements MigrationInterface {
  name = 'SyncScheduleAssignments1739000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "schedule_slot"
        ALTER COLUMN "teacher_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "schedule_slot"
        DROP CONSTRAINT IF EXISTS "FK_schedule_slot_teacher"
    `);
    await queryRunner.query(`
      ALTER TABLE "schedule_slot"
        ADD CONSTRAINT "FK_schedule_slot_teacher"
        FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "schedule_slot" WHERE "teacher_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "schedule_slot"
        DROP CONSTRAINT IF EXISTS "FK_schedule_slot_teacher"
    `);
    await queryRunner.query(`
      ALTER TABLE "schedule_slot"
        ALTER COLUMN "teacher_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "schedule_slot"
        ADD CONSTRAINT "FK_schedule_slot_teacher"
        FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }
}
