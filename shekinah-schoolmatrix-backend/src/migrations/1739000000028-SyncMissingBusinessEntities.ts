import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sync : horodatage manquant + devoirs sans prof bloquant.
 * journal_entry_line n’avait aucune colonne temporelle (pull impossible).
 * exemption / mesure disciplinaire sont éditées → updated_at pour LWW.
 */
export class SyncMissingBusinessEntities1739000000028
  implements MigrationInterface
{
  name = 'SyncMissingBusinessEntities1739000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "journal_entry_line"
        ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "student_service_exemption"
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "disciplinary_measure"
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "homework_assignment"
        ALTER COLUMN "teacher_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "homework_assignment"
        DROP CONSTRAINT IF EXISTS "FK_homework_assignment_teacher"
    `);
    await queryRunner.query(`
      ALTER TABLE "homework_assignment"
        DROP CONSTRAINT IF EXISTS "homework_assignment_teacher_id_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "homework_assignment"
        ADD CONSTRAINT "FK_homework_assignment_teacher"
        FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "homework_assignment" WHERE "teacher_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "homework_assignment"
        ALTER COLUMN "teacher_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "disciplinary_measure" DROP COLUMN IF EXISTS "updated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "student_service_exemption" DROP COLUMN IF EXISTS "updated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "journal_entry_line" DROP COLUMN IF EXISTS "created_at"
    `);
  }
}
