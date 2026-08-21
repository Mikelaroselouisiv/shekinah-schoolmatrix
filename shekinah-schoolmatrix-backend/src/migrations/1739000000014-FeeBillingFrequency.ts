import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fréquence de facturation des fee_service :
 * ONCE (unique), MONTHLY (mensuel), TERM (trimestriel).
 * amount sur class_fee = montant unitaire (par mois / par trimestre / unique).
 */
export class FeeBillingFrequency1739000000014 implements MigrationInterface {
  name = 'FeeBillingFrequency1739000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'fee_service'
            AND column_name = 'billing_frequency'
        ) THEN
          ALTER TABLE "fee_service"
            ADD COLUMN "billing_frequency" character varying(20) NOT NULL DEFAULT 'ONCE';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'fee_service'
            AND column_name = 'billing_occurrences'
        ) THEN
          ALTER TABLE "fee_service"
            ADD COLUMN "billing_occurrences" integer NULL;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fee_service" DROP COLUMN IF EXISTS "billing_occurrences"`);
    await queryRunner.query(`ALTER TABLE "fee_service" DROP COLUMN IF EXISTS "billing_frequency"`);
  }
}
