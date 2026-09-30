import { MigrationInterface, QueryRunner } from 'typeorm';

export class HomeworkNotation1739000000036 implements MigrationInterface {
  name = 'HomeworkNotation1739000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "homework_assignment"
        ADD COLUMN IF NOT EXISTS "coefficient" numeric(6,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "homework_grade"
        ADD COLUMN IF NOT EXISTS "result" varchar(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "homework_grade" DROP COLUMN IF EXISTS "result"
    `);
    await queryRunner.query(`
      ALTER TABLE "homework_assignment" DROP COLUMN IF EXISTS "coefficient"
    `);
  }
}
