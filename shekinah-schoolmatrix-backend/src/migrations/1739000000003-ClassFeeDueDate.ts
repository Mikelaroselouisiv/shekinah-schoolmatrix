import { MigrationInterface, QueryRunner } from 'typeorm';

/** class_fee : ajout colonne due_date (échéance de paiement pour les parents). */
export class ClassFeeDueDate1739000000003 implements MigrationInterface {
  name = 'ClassFeeDueDate1739000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'class_fee' AND column_name = 'due_date') THEN
          ALTER TABLE "class_fee" ADD COLUMN "due_date" date;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "class_fee" DROP COLUMN IF EXISTS "due_date";`);
  }
}
