import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentTransactionCancelled1739000000023 implements MigrationInterface {
  name = 'PaymentTransactionCancelled1739000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_transaction"
      ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_transaction"
      DROP COLUMN IF EXISTS "cancelled_at"
    `);
  }
}
