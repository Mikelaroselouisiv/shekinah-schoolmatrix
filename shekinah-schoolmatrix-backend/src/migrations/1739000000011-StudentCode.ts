import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateStudentCode, normalizeStudentCode } from '../students/student-code';

/**
 * Code de gestion école (student_code) — identifiant public pour badges / fiches.
 * 8 caractères alphanumériques (lettres + chiffres), sans année.
 * Le NISU (order_number) reste l’identifiant ministériel sensible.
 */
export class StudentCode1739000000011 implements MigrationInterface {
  name = 'StudentCode1739000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "student"
        ADD COLUMN IF NOT EXISTS "student_code" character varying(50)
    `);

    const rows: { id: string; student_code: string | null }[] = await queryRunner.query(`
      SELECT "id", "student_code" FROM "student"
      WHERE "student_code" IS NULL OR TRIM("student_code") = ''
         OR "student_code" ~* '^EL-'
    `);

    const used = new Set<string>();
    const existing: { student_code: string }[] = await queryRunner.query(`
      SELECT "student_code" FROM "student"
      WHERE "student_code" IS NOT NULL AND TRIM("student_code") <> ''
        AND "student_code" !~* '^EL-'
    `);
    for (const e of existing) {
      const n = normalizeStudentCode(e.student_code);
      if (n) used.add(n);
    }

    for (const row of rows) {
      let code = '';
      for (let i = 0; i < 40; i++) {
        const candidate = generateStudentCode();
        if (!used.has(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        throw new Error(`Impossible de générer un student_code unique pour ${row.id}`);
      }
      used.add(code);
      await queryRunner.query(
        `UPDATE "student" SET "student_code" = $1 WHERE "id" = $2`,
        [code, row.id],
      );
    }

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_student_student_code'
        ) THEN
          ALTER TABLE "student"
            ADD CONSTRAINT "UQ_student_student_code" UNIQUE ("student_code");
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "student" DROP CONSTRAINT IF EXISTS "UQ_student_student_code"
    `);
    await queryRunner.query(`
      ALTER TABLE "student" DROP COLUMN IF EXISTS "student_code"
    `);
  }
}
