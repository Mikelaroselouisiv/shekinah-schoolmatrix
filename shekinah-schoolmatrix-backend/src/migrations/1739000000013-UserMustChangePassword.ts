import { MigrationInterface, QueryRunner } from 'typeorm';

/** users.must_change_password — forcer la personnalisation au premier login. */
export class UserMustChangePassword1739000000013 implements MigrationInterface {
  name = 'UserMustChangePassword1739000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users'
            AND column_name = 'must_change_password'
        ) THEN
          ALTER TABLE "users" ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT false;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "must_change_password";`);
  }
}
