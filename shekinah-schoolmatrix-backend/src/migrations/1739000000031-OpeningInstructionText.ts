import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpeningInstructionText1739000000031 implements MigrationInterface {
  name = 'OpeningInstructionText1739000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_opening_instruction"
        ALTER COLUMN "text" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "school_opening_instruction"
        ALTER COLUMN "text" TYPE varchar(240)
    `);
  }
}
