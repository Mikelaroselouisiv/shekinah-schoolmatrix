import { MigrationInterface, QueryRunner } from 'typeorm';

/** Périmètre pédagogique : role.education_levels + normalisation de class.level. */
export class RoleEducationLevels1739000000015 implements MigrationInterface {
  name = 'RoleEducationLevels1739000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'role'
            AND column_name = 'education_levels'
        ) THEN
          ALTER TABLE "role" ADD COLUMN "education_levels" text;
        END IF;
      END $$;
    `);

    // Le libellé saisi par l'école est accentué et incohérent d'une ligne à
    // l'autre : on désaccentue avant de reconnaître le cycle, sinon
    // « Préscolaire » ne correspond à aucun motif et la classe reste hors
    // périmètre de tous les rôles bornés.
    await queryRunner.query(`
      UPDATE "class" c
      SET "level" = CASE
        WHEN c."level" IN (
          'PRESCOLAIRE', 'FONDAMENTAL_1', 'FONDAMENTAL_2', 'FONDAMENTAL_3',
          'SECONDAIRE', 'FORMATION_SUPERIEURE'
        ) THEN c."level"
        WHEN x.txt ~ 'prescol|matern|jardin' THEN 'PRESCOLAIRE'
        WHEN x.txt ~ '(7e|8e|9e|7eme|8eme|9eme).*(af|fondament)|3e cycle|troisieme cycle' THEN 'FONDAMENTAL_3'
        WHEN x.txt ~ '(5e|6e|5eme|6eme).*(af|fondament)|2e cycle|deuxieme cycle' THEN 'FONDAMENTAL_2'
        WHEN x.txt ~ '(1e|1ere|2e|3e|4e).*(af|fondament)|1er cycle|fondament' THEN 'FONDAMENTAL_1'
        WHEN x.txt ~ 'secondair|rheto|philo|ns[- ]|seconde|terminale' THEN 'SECONDAIRE'
        WHEN x.txt ~ 'superieur|universitaire|licence|bts' THEN 'FORMATION_SUPERIEURE'
        ELSE c."level"
      END
      FROM (
        SELECT
          "id",
          translate(
            lower(coalesce("name",'') || ' ' || coalesce("description",'') || ' ' || coalesce("level",'')),
            'àâäéèêëîïôöùûüç',
            'aaaeeeeiioouuuc'
          ) AS txt
        FROM "class"
      ) x
      WHERE x."id" = c."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "role" DROP COLUMN IF EXISTS "education_levels";`,
    );
  }
}
