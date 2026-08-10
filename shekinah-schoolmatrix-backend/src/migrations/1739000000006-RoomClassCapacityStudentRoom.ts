import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modèle haïtien : une classe pédagogique a plusieurs salles (ex. 1ère année 1/2/3).
 * - room.class_id + room.capacity
 * - student.room_id
 * Backfill depuis l’ancien class.room_id.
 */
export class RoomClassCapacityStudentRoom1739000000006 implements MigrationInterface {
  name = 'RoomClassCapacityStudentRoom1739000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'room'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'room' AND column_name = 'capacity'
          ) THEN
            ALTER TABLE "room" ADD COLUMN "capacity" integer NULL;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'room' AND column_name = 'class_id'
          ) THEN
            ALTER TABLE "room" ADD COLUMN "class_id" uuid NULL;
          END IF;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'student'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'student' AND column_name = 'room_id'
        ) THEN
          ALTER TABLE "student" ADD COLUMN "room_id" uuid NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_room_class'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'room' AND column_name = 'class_id'
        ) THEN
          ALTER TABLE "room"
            ADD CONSTRAINT "FK_room_class"
            FOREIGN KEY ("class_id") REFERENCES "class"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_student_room'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'student' AND column_name = 'room_id'
        ) THEN
          ALTER TABLE "student"
            ADD CONSTRAINT "FK_student_room"
            FOREIGN KEY ("room_id") REFERENCES "room"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // Backfill room.class_id depuis class.room_id (1 salle ← 1 classe historique)
    await queryRunner.query(`
      UPDATE "room" r
      SET "class_id" = c.id
      FROM "class" c
      WHERE c.room_id = r.id
        AND r.class_id IS NULL
    `);

    // Backfill student.room_id depuis la salle de sa classe
    await queryRunner.query(`
      UPDATE "student" s
      SET "room_id" = c.room_id
      FROM "class" c
      WHERE s.class_id = c.id
        AND c.room_id IS NOT NULL
        AND s.room_id IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_room_class_id" ON "room" ("class_id");
      CREATE INDEX IF NOT EXISTS "IDX_student_room_id" ON "student" ("room_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_student_room_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_room_class_id"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_student_room') THEN
          ALTER TABLE "student" DROP CONSTRAINT "FK_student_room";
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_room_class') THEN
          ALTER TABLE "room" DROP CONSTRAINT "FK_room_class";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "student" DROP COLUMN IF EXISTS "room_id";
      ALTER TABLE "room" DROP COLUMN IF EXISTS "class_id";
      ALTER TABLE "room" DROP COLUMN IF EXISTS "capacity";
    `);
  }
}
