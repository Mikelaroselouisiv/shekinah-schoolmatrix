import { MigrationInterface, QueryRunner } from 'typeorm';

export class BringItemCatalog1739000000026 implements MigrationInterface {
  name = 'BringItemCatalog1739000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bring_item_catalog" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "label" varchar(160) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bring_item_catalog_label_lower"
        ON "bring_item_catalog" (LOWER("label"))
    `);
    await queryRunner.query(`
      INSERT INTO "bring_item_catalog" ("label")
      SELECT DISTINCT ON (LOWER(TRIM("label"))) TRIM("label")
      FROM "class_bring_item"
      WHERE "label" IS NOT NULL AND TRIM("label") <> ''
      ORDER BY LOWER(TRIM("label")), "created_at" ASC
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bring_item_catalog_label_lower"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bring_item_catalog"`);
  }
}
