import { MigrationInterface, QueryRunner } from 'typeorm';

/** Périmètre pédagogique : role.education_levels + normalisation de class.level. */
export class RoleEducationLevels1739000000018 implements MigrationInterface {
  name = 'RoleEducationLevels1739000000018';

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

    await queryRunner.query(`
      UPDATE "class"
      SET "level" = CASE
        WHEN "level" IN (
          'PRESCOLAIRE', 'FONDAMENTAL_1', 'FONDAMENTAL_2', 'FONDAMENTAL_3',
          'SECONDAIRE', 'FORMATION_SUPERIEURE'
        ) THEN "level"
        WHEN lower(coalesce("name",'') || ' ' || coalesce("description",'') || ' ' || coalesce("level",''))
          ~ 'prescol|matern|jardin' THEN 'PRESCOLAIRE'
        WHEN lower(coalesce("name",'') || ' ' || coalesce("level",''))
          ~ '(7e|8e|9e|7eme|8eme|9eme).*(af|fondament)|3e cycle|troisieme cycle' THEN 'FONDAMENTAL_3'
        WHEN lower(coalesce("name",'') || ' ' || coalesce("level",''))
          ~ '(5e|6e|5eme|6eme).*(af|fondament)|2e cycle|deuxieme cycle' THEN 'FONDAMENTAL_2'
        WHEN lower(coalesce("name",'') || ' ' || coalesce("level",''))
          ~ '(1e|1ere|2e|3e|4e).*(af|fondament)|1er cycle' THEN 'FONDAMENTAL_1'
        WHEN lower(coalesce("name",'') || ' ' || coalesce("level",''))
          ~ 'secondair|rheto|philo|ns[- ]|seconde|terminale' THEN 'SECONDAIRE'
        WHEN lower(coalesce("name",'') || ' ' || coalesce("level",''))
          ~ 'superieur|universitaire|licence|bts' THEN 'FORMATION_SUPERIEURE'
        ELSE "level"
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "role" DROP COLUMN IF EXISTS "education_levels";`,
    );
  }
}
