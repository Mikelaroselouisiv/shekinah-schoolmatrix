import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateStudentCode, normalizeStudentCode } from '../students/student-code';

/**
 * Remplace les codes école au format EL-AAAA-##### (si déjà créés) par des codes
 * alphanumériques de 8 caractères, sans année.
 */
export class StudentCodeAlphanumeric1739000000012 implements MigrationInterface {
  name = 'StudentCodeAlphanumeric1739000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol: { exists: boolean }[] = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'student' AND column_name = 'student_code'
      ) AS "exists"
    `);
    if (!hasCol[0]?.exists) return;

    const rows: { id: string; student_code: string | null }[] = await queryRunner.query(`
      SELECT "id", "student_code" FROM "student"
      WHERE "student_code" IS NULL
         OR TRIM("student_code") = ''
         OR "student_code" ~* '^EL-'
         OR LENGTH(REGEXP_REPLACE(TRIM("student_code"), '[\\s\\-]', '', 'g')) <> 8
    `);

    const used = new Set<string>();
    const keep: { student_code: string }[] = await queryRunner.query(`
      SELECT "student_code" FROM "student"
      WHERE "student_code" IS NOT NULL
        AND TRIM("student_code") <> ''
        AND "student_code" !~* '^EL-'
        AND LENGTH(REGEXP_REPLACE(TRIM("student_code"), '[\\s\\-]', '', 'g')) = 8
    `);
    for (const e of keep) {
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
        `UPDATE "student" SET "student_code" = $1, "updated_at" = NOW() WHERE "id" = $2`,
        [code, row.id],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irréversible (codes aléatoires).
  }
}
