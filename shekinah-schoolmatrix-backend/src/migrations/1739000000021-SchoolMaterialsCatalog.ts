import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolMaterialsCatalog1739000000021 implements MigrationInterface {
  name = 'SchoolMaterialsCatalog1739000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_material" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "kind" varchar(20) NOT NULL,
        "name" varchar(80) NOT NULL,
        "subject_id" uuid REFERENCES "subject"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_school_material_kind_name" UNIQUE ("kind", "name")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "school_material"`);
  }
}
