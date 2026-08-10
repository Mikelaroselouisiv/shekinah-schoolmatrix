import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Assignation professeur par salle (section) :
 * teacher_class_subject.room_id — une classe a plusieurs salles,
 * le prof est assigné à une salle + matière.
 */
export class TeacherClassSubjectRoom1739000000008 implements MigrationInterface {
  name = 'TeacherClassSubjectRoom1739000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'teacher_class_subject'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'teacher_class_subject' AND column_name = 'room_id'
        ) THEN
          ALTER TABLE "teacher_class_subject" ADD COLUMN "room_id" uuid NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_teacher_class_subject_room'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'teacher_class_subject' AND column_name = 'room_id'
        ) THEN
          ALTER TABLE "teacher_class_subject"
            ADD CONSTRAINT "FK_teacher_class_subject_room"
            FOREIGN KEY ("room_id") REFERENCES "room"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // Backfill : première salle de la classe
    await queryRunner.query(`
      UPDATE "teacher_class_subject" tcs
      SET "room_id" = sub.rid
      FROM (
        SELECT DISTINCT ON (r.class_id) r.class_id, r.id AS rid
        FROM "room" r
        WHERE r.class_id IS NOT NULL
        ORDER BY r.class_id, r.name ASC
      ) sub
      WHERE tcs.room_id IS NULL
        AND tcs.class_id = sub.class_id
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_teacher_class_subject'
        ) THEN
          ALTER TABLE "teacher_class_subject" DROP CONSTRAINT "UQ_teacher_class_subject";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_teacher_class_subject_room'
        ) THEN
          ALTER TABLE "teacher_class_subject"
            ADD CONSTRAINT "UQ_teacher_class_subject_room"
            UNIQUE ("teacher_id", "class_id", "subject_id", "room_id");
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_teacher_class_subject_room_id"
        ON "teacher_class_subject" ("room_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_teacher_class_subject_room_id"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UQ_teacher_class_subject_room') THEN
          ALTER TABLE "teacher_class_subject" DROP CONSTRAINT "UQ_teacher_class_subject_room";
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UQ_teacher_class_subject') THEN
          ALTER TABLE "teacher_class_subject"
            ADD CONSTRAINT "UQ_teacher_class_subject"
            UNIQUE ("teacher_id", "class_id", "subject_id");
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_teacher_class_subject_room') THEN
          ALTER TABLE "teacher_class_subject" DROP CONSTRAINT "FK_teacher_class_subject_room";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "teacher_class_subject" DROP COLUMN IF EXISTS "room_id";
    `);
  }
}
