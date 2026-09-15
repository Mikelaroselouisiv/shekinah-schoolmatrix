import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Les assignations profs n’avaient que created_at : après un pull raté
 * (FK teacher_id), le curseur agent avançait et ne les reprenait jamais.
 * updated_at = now() au déploiement force un nouveau pull LWW.
 */
export class TeacherAssignmentUpdatedAt1739000000029
  implements MigrationInterface
{
  name = 'TeacherAssignmentUpdatedAt1739000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "teacher_class_subject"
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "class_teacher"
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "teacher_subject"
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "teacher_subject" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_teacher" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teacher_class_subject" DROP COLUMN IF EXISTS "updated_at"`,
    );
  }
}
