import { MigrationInterface, QueryRunner } from 'typeorm';

/** Contact établissement + table des signatures (PNG, nom, rôle). */
export class SchoolContactAndSignatures1739000000004 implements MigrationInterface {
  name = 'SchoolContactAndSignatures1739000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_profile' AND column_name = 'address') THEN
          ALTER TABLE "school_profile" ADD COLUMN "address" character varying(512);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_profile' AND column_name = 'phone') THEN
          ALTER TABLE "school_profile" ADD COLUMN "phone" character varying(64);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_profile' AND column_name = 'email') THEN
          ALTER TABLE "school_profile" ADD COLUMN "email" character varying(256);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_signature" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "school_profile_id" uuid NOT NULL,
        "slot_key" character varying(64) NOT NULL,
        "signer_name" character varying(256) NOT NULL DEFAULT '',
        "signer_role" character varying(256) NOT NULL DEFAULT '',
        "image_url" character varying(1024),
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_signature" PRIMARY KEY ("id"),
        CONSTRAINT "FK_school_signature_profile" FOREIGN KEY ("school_profile_id")
          REFERENCES "school_profile"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_signature_profile"
        ON "school_signature" ("school_profile_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_signature_slot"
        ON "school_signature" ("school_profile_id", "slot_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "school_signature";`);
    await queryRunner.query(`ALTER TABLE "school_profile" DROP COLUMN IF EXISTS "email";`);
    await queryRunner.query(`ALTER TABLE "school_profile" DROP COLUMN IF EXISTS "phone";`);
    await queryRunner.query(`ALTER TABLE "school_profile" DROP COLUMN IF EXISTS "address";`);
  }
}
