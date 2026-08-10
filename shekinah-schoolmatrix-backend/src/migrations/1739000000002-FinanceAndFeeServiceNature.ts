import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Finance : colonne nature sur fee_service + tables exercice, account, journal_entry,
 * journal_entry_line, other_revenue, expense.
 */
export class FinanceAndFeeServiceNature1739000000002 implements MigrationInterface {
  name = 'FinanceAndFeeServiceNature1739000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. fee_service : ajout colonne nature (OBLIGATOIRE | PARASCOLAIRE), idempotent
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'fee_service' AND column_name = 'nature') THEN
          ALTER TABLE "fee_service" ADD COLUMN "nature" character varying(20) NOT NULL DEFAULT 'OBLIGATOIRE';
        END IF;
      END $$;
    `);

    // 2. exercice
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exercice" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "date_debut" date NOT NULL,
        "date_fin" date NOT NULL,
        "statut" character varying(50) NOT NULL DEFAULT 'OUVERT',
        "date_cloture" date,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exercice" PRIMARY KEY ("id")
      );
    `);

    // 3. account (plan comptable)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(20) NOT NULL,
        "label" character varying NOT NULL,
        "type" character varying(20) NOT NULL,
        "parent_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_account_code" UNIQUE ("code"),
        CONSTRAINT "PK_account" PRIMARY KEY ("id"),
        CONSTRAINT "FK_account_parent" FOREIGN KEY ("parent_id") REFERENCES "account"("id") ON DELETE SET NULL
      );
    `);

    // 4. journal_entry
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "journal_entry" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "exercice_id" uuid NOT NULL,
        "entry_date" date NOT NULL,
        "label" text NOT NULL,
        "source" character varying(30) NOT NULL,
        "source_ref" character varying(36),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_journal_entry" PRIMARY KEY ("id"),
        CONSTRAINT "FK_journal_entry_exercice" FOREIGN KEY ("exercice_id") REFERENCES "exercice"("id") ON DELETE CASCADE
      );
    `);

    // 5. journal_entry_line
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "journal_entry_line" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "entry_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "debit" decimal(14,2) NOT NULL DEFAULT 0,
        "credit" decimal(14,2) NOT NULL DEFAULT 0,
        "line_label" text,
        CONSTRAINT "PK_journal_entry_line" PRIMARY KEY ("id"),
        CONSTRAINT "FK_journal_entry_line_entry" FOREIGN KEY ("entry_id") REFERENCES "journal_entry"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_journal_entry_line_account" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT
      );
    `);

    // 6. other_revenue
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "other_revenue" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "revenue_date" date NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "label" text NOT NULL,
        "category" character varying(50),
        "fee_service_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_other_revenue" PRIMARY KEY ("id"),
        CONSTRAINT "FK_other_revenue_fee_service" FOREIGN KEY ("fee_service_id") REFERENCES "fee_service"("id") ON DELETE SET NULL
      );
    `);

    // 7. expense
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "expense_date" date NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "label" text NOT NULL,
        "beneficiary" character varying(255),
        "category" character varying(50),
        "document_ref" character varying(100),
        "statut" character varying(20) NOT NULL DEFAULT 'BROUILLON',
        "fee_service_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expense" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_fee_service" FOREIGN KEY ("fee_service_id") REFERENCES "fee_service"("id") ON DELETE SET NULL
      );
    `);

    // Index utiles
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_journal_entry_exercice_id" ON "journal_entry" ("exercice_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_journal_entry_entry_date" ON "journal_entry" ("entry_date");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_journal_entry_line_entry_id" ON "journal_entry_line" ("entry_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "expense"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "other_revenue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entry_line"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exercice"`);
    await queryRunner.query(`ALTER TABLE "fee_service" DROP COLUMN IF EXISTS "nature"`);
  }
}
