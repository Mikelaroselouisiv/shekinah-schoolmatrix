import { MigrationInterface, QueryRunner } from 'typeorm';

export class BanksAndBankAccounts1739000000007 implements MigrationInterface {
  name = 'BanksAndBankAccounts1739000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'bank'
        ) THEN
          CREATE TABLE "bank" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" character varying(200) NOT NULL,
            "active" boolean NOT NULL DEFAULT true,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_bank" PRIMARY KEY ("id")
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'bank_account'
        ) THEN
          CREATE TABLE "bank_account" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "bank_id" uuid NOT NULL,
            "name" character varying(200) NOT NULL,
            "account_number" character varying(100) NULL,
            "opening_balance" numeric(14,2) NOT NULL DEFAULT 0,
            "active" boolean NOT NULL DEFAULT true,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_bank_account" PRIMARY KEY ("id")
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_bank_account_bank'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'bank_account'
        ) THEN
          ALTER TABLE "bank_account"
            ADD CONSTRAINT "FK_bank_account_bank"
            FOREIGN KEY ("bank_id") REFERENCES "bank"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'payment_transaction'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'payment_transaction' AND column_name = 'bank_account_id'
        ) THEN
          ALTER TABLE "payment_transaction" ADD COLUMN "bank_account_id" uuid NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'expense'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'expense' AND column_name = 'bank_account_id'
        ) THEN
          ALTER TABLE "expense" ADD COLUMN "bank_account_id" uuid NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_payment_transaction_bank_account'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'payment_transaction' AND column_name = 'bank_account_id'
        ) THEN
          ALTER TABLE "payment_transaction"
            ADD CONSTRAINT "FK_payment_transaction_bank_account"
            FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_expense_bank_account'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'expense' AND column_name = 'bank_account_id'
        ) THEN
          ALTER TABLE "expense"
            ADD CONSTRAINT "FK_expense_bank_account"
            FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_payment_transaction_bank_account') THEN
          ALTER TABLE "payment_transaction" DROP CONSTRAINT "FK_payment_transaction_bank_account";
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_expense_bank_account') THEN
          ALTER TABLE "expense" DROP CONSTRAINT "FK_expense_bank_account";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'payment_transaction' AND column_name = 'bank_account_id'
        ) THEN
          ALTER TABLE "payment_transaction" DROP COLUMN "bank_account_id";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'expense' AND column_name = 'bank_account_id'
        ) THEN
          ALTER TABLE "expense" DROP COLUMN "bank_account_id";
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_bank_account_bank') THEN
          ALTER TABLE "bank_account" DROP CONSTRAINT "FK_bank_account_bank";
        END IF;
        DROP TABLE IF EXISTS "bank_account";
        DROP TABLE IF EXISTS "bank";
      END $$;
    `);
  }
}
