import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentAbsenceReset1739000000039 implements MigrationInterface {
  name = 'StudentAbsenceReset1739000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "student"
      ADD COLUMN IF NOT EXISTS "absence_reset_on" date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "student" DROP COLUMN IF EXISTS "absence_reset_on"`);
  }
}
