import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration initiale complète du schéma métier.
 * Crée toutes les tables nécessaires pour démarrer en production sur une base vide.
 * Ordre respectant les dépendances (clés étrangères).
 */
export class InitialBusinessSchema1738000000000 implements MigrationInterface {
  name = 'InitialBusinessSchema1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. role (aucune FK)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "permissions" json,
        CONSTRAINT "UQ_role_name" UNIQUE ("name"),
        CONSTRAINT "PK_role" PRIMARY KEY ("id")
      );
    `);

    // 2. school_profile (aucune FK)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_profile" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "slogan" character varying(256),
        "domain" character varying,
        "logo_url" character varying(512),
        "primary_color" character varying NOT NULL DEFAULT '#1e293b',
        "secondary_color" character varying NOT NULL DEFAULT '#334155',
        "active" boolean NOT NULL DEFAULT true,
        "current_academic_year_id" uuid,
        "current_period_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_profile" PRIMARY KEY ("id")
      );
    `);

    // 3. room
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "room" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "description" character varying,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_room" PRIMARY KEY ("id")
      );
    `);

    // 4. subject
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subject" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "code" character varying,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subject" PRIMARY KEY ("id")
      );
    `);

    // 5. academic_year
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "academic_year" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(20) NOT NULL,
        "start_date" date,
        "end_date" date,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_academic_year_name" UNIQUE ("name"),
        CONSTRAINT "PK_academic_year" PRIMARY KEY ("id")
      );
    `);

    // 6. period (FK academic_year)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "period" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "academic_year_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "order_index" smallint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_period" PRIMARY KEY ("id"),
        CONSTRAINT "FK_period_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE
      );
    `);

    // 7. users (FK role)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL NOT NULL,
        "first_name" character varying,
        "last_name" character varying,
        "email" character varying NOT NULL,
        "address" character varying,
        "phone" character varying,
        "whatsapp" character varying,
        "profile_photo_url" character varying,
        "cover_photo_url" character varying,
        "order_number" character varying(50),
        "password_hash" character varying NOT NULL,
        "role_id" integer NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_role" FOREIGN KEY ("role_id") REFERENCES "role"("id")
      );
    `);

    // 8. class (FK room nullable)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "description" character varying,
        "level" character varying,
        "section" character varying(20),
        "room_id" uuid,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_class" PRIMARY KEY ("id"),
        CONSTRAINT "FK_class_room" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE SET NULL
      );
    `);

    // 9. class_subject (FK class, subject)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_subject" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_class_subject" UNIQUE ("class_id", "subject_id"),
        CONSTRAINT "PK_class_subject" PRIMARY KEY ("id"),
        CONSTRAINT "FK_class_subject_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_class_subject_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE
      );
    `);

    // 10. student (FK class)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "first_name" character varying NOT NULL,
        "last_name" character varying NOT NULL,
        "email" character varying,
        "phone" character varying,
        "address" character varying,
        "birth_date" date,
        "birth_place" character varying(200),
        "gender" character varying,
        "photo_identity_student" character varying(500),
        "photo_identity_mother" character varying(500),
        "photo_identity_father" character varying(500),
        "photo_identity_responsible" character varying(500),
        "mother_name" character varying(200),
        "mother_phone" character varying(50),
        "father_name" character varying(200),
        "father_phone" character varying(50),
        "responsible_name" character varying(200),
        "responsible_phone" character varying(50),
        "class_id" uuid NOT NULL,
        "order_number" character varying(50),
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_student_order_number" UNIQUE ("order_number"),
        CONSTRAINT "PK_student" PRIMARY KEY ("id"),
        CONSTRAINT "FK_student_class" FOREIGN KEY ("class_id") REFERENCES "class"("id")
      );
    `);

    // 11. student_parent (FK student, user)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_parent" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "relationship" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_student_parent" PRIMARY KEY ("id"),
        CONSTRAINT "FK_student_parent_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_student_parent_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // 12. user_linked_student (FK user, student)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_linked_student" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        "student_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_linked_student" UNIQUE ("user_id", "student_id"),
        CONSTRAINT "PK_user_linked_student" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_linked_student_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_linked_student_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE
      );
    `);

    // 13. teacher_subject (FK user, subject)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "teacher_subject" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "teacher_id" integer NOT NULL,
        "subject_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_teacher_subject" UNIQUE ("teacher_id", "subject_id"),
        CONSTRAINT "PK_teacher_subject" PRIMARY KEY ("id"),
        CONSTRAINT "FK_teacher_subject_user" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_subject_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE
      );
    `);

    // 14. teacher_class_subject (FK user, class, subject)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "teacher_class_subject" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "teacher_id" integer NOT NULL,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_teacher_class_subject" UNIQUE ("teacher_id", "class_id", "subject_id"),
        CONSTRAINT "PK_teacher_class_subject" PRIMARY KEY ("id"),
        CONSTRAINT "FK_teacher_class_subject_user" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_class_subject_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_class_subject_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE
      );
    `);

    // 15. class_teacher (FK class, user)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_teacher" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "is_main" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_class_teacher" UNIQUE ("class_id", "user_id"),
        CONSTRAINT "PK_class_teacher" PRIMARY KEY ("id"),
        CONSTRAINT "FK_class_teacher_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_class_teacher_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // 16. schedule_slot (FK class, subject, user, room nullable)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "schedule_slot" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "teacher_id" integer NOT NULL,
        "room_id" uuid,
        "academic_year" character varying(20),
        "day_of_week" smallint NOT NULL,
        "start_time" character varying(5) NOT NULL,
        "end_time" character varying(5) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schedule_slot" PRIMARY KEY ("id"),
        CONSTRAINT "FK_schedule_slot_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_schedule_slot_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_schedule_slot_teacher" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_schedule_slot_room" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE SET NULL
      );
    `);

    // 17. fee_service
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_service" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "code" character varying,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fee_service" PRIMARY KEY ("id")
      );
    `);

    // 18. class_fee (FK class, fee_service)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_fee" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "academic_year" character varying(20) NOT NULL,
        "class_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "detail" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_class_fee" PRIMARY KEY ("id"),
        CONSTRAINT "FK_class_fee_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_class_fee_service" FOREIGN KEY ("service_id") REFERENCES "fee_service"("id") ON DELETE CASCADE
      );
    `);

    // 19. payment_transaction (FK student, class, fee_service)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_transaction" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "academic_year" character varying(20) NOT NULL,
        "service_id" uuid NOT NULL,
        "amount_due" decimal(12,2) NOT NULL,
        "amount_paid" decimal(12,2) NOT NULL,
        "payment_date" date NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_transaction" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_transaction_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_transaction_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_transaction_service" FOREIGN KEY ("service_id") REFERENCES "fee_service"("id") ON DELETE CASCADE
      );
    `);

    // 20. student_service_exemption (FK student, fee_service)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_service_exemption" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "academic_year" character varying(20) NOT NULL,
        "service_id" uuid NOT NULL,
        "exemption_type" character varying(10) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_student_service_exemption" PRIMARY KEY ("id"),
        CONSTRAINT "FK_student_service_exemption_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_student_service_exemption_service" FOREIGN KEY ("service_id") REFERENCES "fee_service"("id") ON DELETE CASCADE
      );
    `);

    // 21. grade (FK student, academic_year, class, subject, period)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "grade" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "period_id" uuid NOT NULL,
        "coefficient" decimal(6,2) NOT NULL,
        "grade_value" decimal(6,2) NOT NULL,
        "detail" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_grade" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grade_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_grade_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_grade_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_grade_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_grade_period" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE CASCADE
      );
    `);

    // 22. preschool_grade
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "preschool_grade" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "period_id" uuid NOT NULL,
        "level" character varying(20),
        "frequency" character varying(20),
        "observation" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_preschool_grade" PRIMARY KEY ("id"),
        CONSTRAINT "FK_preschool_grade_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_preschool_grade_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_preschool_grade_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_preschool_grade_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_preschool_grade_period" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE CASCADE
      );
    `);

    // 23. class_subject_coefficient (FK academic_year, class, subject)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_subject_coefficient" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "academic_year_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "coefficient" decimal(6,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_class_subject_coefficient" UNIQUE ("academic_year_id", "class_id", "subject_id"),
        CONSTRAINT "PK_class_subject_coefficient" PRIMARY KEY ("id"),
        CONSTRAINT "FK_class_subject_coefficient_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_class_subject_coefficient_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_class_subject_coefficient_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE
      );
    `);

    // 24. exam_schedule (FK class, subject, period nullable)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "exam_schedule" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "period_id" uuid,
        "period" character varying(80) NOT NULL,
        "exam_date" date NOT NULL,
        "start_time" character varying(5) NOT NULL,
        "end_time" character varying(5) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exam_schedule" PRIMARY KEY ("id"),
        CONSTRAINT "FK_exam_schedule_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_schedule_subject" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_exam_schedule_period" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE SET NULL
      );
    `);

    // 25. extracurricular_activity (FK academic_year, class)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "extracurricular_activity" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "academic_year_id" uuid NOT NULL,
        "activity_date" date NOT NULL,
        "start_time" character varying(5) NOT NULL,
        "end_time" character varying(5) NOT NULL,
        "class_id" uuid NOT NULL,
        "occasion" character varying(200) NOT NULL,
        "participation_fee" character varying(80),
        "dress_code" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_extracurricular_activity" PRIMARY KEY ("id"),
        CONSTRAINT "FK_extracurricular_activity_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_extracurricular_activity_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE
      );
    `);

    // 26. attendance (FK class, student)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "date" date NOT NULL,
        "status" character varying(10) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_attendance" UNIQUE ("class_id", "student_id", "date"),
        CONSTRAINT "PK_attendance" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE
      );
    `);

    // 27. lateness (FK student, class)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lateness" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "date" date NOT NULL,
        "arrival_time" character varying(5) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lateness" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lateness_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lateness_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE
      );
    `);

    // 28. disciplinary_measure (FK student)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disciplinary_measure" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "measure_type" character varying(50) NOT NULL,
        "reason" character varying(500),
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_disciplinary_measure" PRIMARY KEY ("id"),
        CONSTRAINT "FK_disciplinary_measure_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE
      );
    `);

    // 29. disciplinary_deduction (FK student)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disciplinary_deduction" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "points_deducted" integer NOT NULL,
        "reason" character varying(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_disciplinary_deduction" PRIMARY KEY ("id"),
        CONSTRAINT "FK_disciplinary_deduction_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE
      );
    `);

    // 30. student_class_assignment (FK student, academic_year, class)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_class_assignment" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "decision" character varying(30),
        "average" decimal(6,2),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_student_class_assignment" UNIQUE ("student_id", "academic_year_id"),
        CONSTRAINT "PK_student_class_assignment" PRIMARY KEY ("id"),
        CONSTRAINT "FK_student_class_assignment_student" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_student_class_assignment_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_student_class_assignment_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE
      );
    `);

    // 31. class_decision_threshold (FK class, academic_year)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_decision_threshold" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "min_average_admis" decimal(6,2) NOT NULL DEFAULT 10,
        "min_average_admis_ailleurs" decimal(6,2) NOT NULL DEFAULT 8,
        "min_average_redoubler" decimal(6,2) NOT NULL DEFAULT 6,
        "min_average_ajourne" decimal(6,2) NOT NULL DEFAULT 4,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_class_decision_threshold" UNIQUE ("class_id", "academic_year_id"),
        CONSTRAINT "PK_class_decision_threshold" PRIMARY KEY ("id"),
        CONSTRAINT "FK_class_decision_threshold_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_class_decision_threshold_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order of creation (dependents first)
    const tables = [
      'class_decision_threshold',
      'student_class_assignment',
      'disciplinary_deduction',
      'disciplinary_measure',
      'lateness',
      'attendance',
      'extracurricular_activity',
      'exam_schedule',
      'class_subject_coefficient',
      'preschool_grade',
      'grade',
      'student_service_exemption',
      'payment_transaction',
      'class_fee',
      'fee_service',
      'schedule_slot',
      'class_teacher',
      'teacher_class_subject',
      'teacher_subject',
      'user_linked_student',
      'student_parent',
      'student',
      'class_subject',
      'class',
      'users',
      'period',
      'academic_year',
      'subject',
      'room',
      'school_profile',
      'role',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
  }
}
