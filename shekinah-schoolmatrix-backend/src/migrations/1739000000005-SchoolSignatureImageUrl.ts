import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Si une base a déjà `pdf_url` (version précédente), renomme en `image_url`.
 * Les nouvelles installs ont déjà `image_url` via 1739000000004.
 */
export class SchoolSignatureImageUrl1739000000005 implements MigrationInterface {
  name = 'SchoolSignatureImageUrl1739000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'school_signature'
            AND column_name = 'pdf_url'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'school_signature'
            AND column_name = 'image_url'
        ) THEN
          ALTER TABLE "school_signature" RENAME COLUMN "pdf_url" TO "image_url";
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'school_signature'
            AND column_name = 'image_url'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'school_signature'
        ) THEN
          ALTER TABLE "school_signature" ADD COLUMN "image_url" character varying(1024);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'school_signature'
            AND column_name = 'image_url'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'school_signature'
            AND column_name = 'pdf_url'
        ) THEN
          ALTER TABLE "school_signature" RENAME COLUMN "image_url" TO "pdf_url";
        END IF;
      END $$;
    `);
  }
}
