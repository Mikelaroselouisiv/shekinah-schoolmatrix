import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Répartition haïtienne des directeurs pédagogiques :
 * - primaire = 1er + 2e cycles fondamental
 * - secondaire = 3e cycle fondamental + secondaire
 *
 * Les clés de rôle sont conservées (comptes déjà assignés).
 */
export class PedagogicalDirectorHaitiLevels1739000000019
  implements MigrationInterface
{
  name = 'PedagogicalDirectorHaitiLevels1739000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_1","FONDAMENTAL_2"]',
        "description" = 'Directeur / Directrice pédagogique du primaire — 1er et 2e cycles fondamental'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_1","FONDAMENTAL_2"]',
        "description" = 'Alias Directeur pédagogique du primaire (1er et 2e cycles fondamental)'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_2'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_1","FONDAMENTAL_2"]',
        "description" = 'Alias Directeur pédagogique du primaire (1er et 2e cycles)'
      WHERE "name" = 'ADMIN_FONDAMENTAL'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_3","SECONDAIRE"]',
        "description" = 'Alias Directeur pédagogique du secondaire (3e cycle fondamental et secondaire)'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_3'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_3","SECONDAIRE"]',
        "description" = 'Directeur / Directrice pédagogique du secondaire — 3e cycle fondamental et secondaire'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_SECONDAIRE'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_3","SECONDAIRE"]',
        "description" = 'Alias Directeur pédagogique du secondaire (3e cycle et secondaire)'
      WHERE "name" = 'ADMIN_SECONDAIRE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_1","FONDAMENTAL_2"]',
        "description" = 'Directeur / Directrice pédagogique — 1er et 2e cycles fondamental'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_2"]',
        "description" = 'Directeur / Directrice pédagogique — 2e cycle fondamental seulement'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_2'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_1","FONDAMENTAL_2"]',
        "description" = 'Alias Directeur pédagogique 1er et 2e cycles fondamental'
      WHERE "name" = 'ADMIN_FONDAMENTAL'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["FONDAMENTAL_3"]',
        "description" = 'Directeur / Directrice pédagogique — 3e cycle fondamental'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_FONDAMENTAL_3'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["SECONDAIRE"]',
        "description" = 'Directeur / Directrice pédagogique — secondaire'
      WHERE "name" = 'DIRECTEUR_PEDAGOGIQUE_SECONDAIRE'
    `);
    await queryRunner.query(`
      UPDATE "role"
      SET
        "education_levels" = '["SECONDAIRE"]',
        "description" = 'Alias Directeur pédagogique secondaire'
      WHERE "name" = 'ADMIN_SECONDAIRE'
    `);
  }
}
