import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentPhoto1739000000009 implements MigrationInterface {
  name = 'StudentPhoto1739000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_photo" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "student_id" uuid NOT NULL,
        "kind" character varying(40) NOT NULL,
        "label" character varying(200),
        "url" character varying(500) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_student_photo" PRIMARY KEY ("id"),
        CONSTRAINT "FK_student_photo_student" FOREIGN KEY ("student_id")
          REFERENCES "student"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_student_photo_student_id"
        ON "student_photo" ("student_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_student_photo_student_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "student_photo"`);
  }
}
