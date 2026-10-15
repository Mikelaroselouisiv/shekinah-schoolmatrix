import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExamPeriodPeriodId1739000000037 implements MigrationInterface {
  name = 'ExamPeriodPeriodId1739000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exam_period"
        ADD COLUMN IF NOT EXISTS "period_id" uuid
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_exam_period_period'
        ) THEN
          ALTER TABLE "exam_period"
            ADD CONSTRAINT "FK_exam_period_period"
            FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      UPDATE "exam_period" ep
      SET "period_id" = p.id
      FROM "period" p, "class" c
      WHERE ep.period_id IS NULL
        AND c.id = ep.class_id
        AND p.academic_year_id = ep.academic_year_id
        AND p.name = ep.period_name
        AND p.scope = CASE
          WHEN UPPER(COALESCE(c.level, '')) = 'PRESCOLAIRE' THEN 'PRESCOLAIRE'
          ELSE 'ECOLE'
        END
    `);
    await queryRunner.query(`
      UPDATE "exam_period" ep
      SET "period_id" = p.id
      FROM "period" p
      WHERE ep.period_id IS NULL
        AND p.academic_year_id = ep.academic_year_id
        AND p.name = ep.period_name
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exam_period" DROP CONSTRAINT IF EXISTS "FK_exam_period_period"
    `);
    await queryRunner.query(`
      ALTER TABLE "exam_period" DROP COLUMN IF EXISTS "period_id"
    `);
  }
}
