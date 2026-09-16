import { DataSource } from 'typeorm';

/**
 * L’élève.classe courante est la source de vérité pour l’année en cours.
 * student_class_assignment de cette année doit toujours suivre — sinon
 * fiche / horaire / formation voient encore l’ancienne classe.
 */
export async function alignCurrentYearClass(
  ds: DataSource,
  studentId: string,
): Promise<void> {
  const id = studentId?.trim();
  if (!id) return;

  await ds.query(
    `
    WITH cur AS (
      SELECT current_academic_year_id AS year_id
      FROM school_profile
      WHERE current_academic_year_id IS NOT NULL
      LIMIT 1
    )
    UPDATE student_class_assignment AS a
    SET class_id = s.class_id,
        updated_at = now()
    FROM student AS s, cur
    WHERE a.student_id = s.id
      AND a.academic_year_id = cur.year_id
      AND s.id = $1::uuid
      AND s.class_id IS NOT NULL
      AND s.archived_at IS NULL
      AND s.active IS DISTINCT FROM false
      AND a.class_id IS DISTINCT FROM s.class_id
    `,
    [id],
  );

  await ds.query(
    `
    INSERT INTO student_class_assignment
      (id, student_id, academic_year_id, class_id, decision, average, created_at, updated_at)
    SELECT gen_random_uuid(), s.id, cur.year_id, s.class_id, NULL, NULL, now(), now()
    FROM student s
    CROSS JOIN (
      SELECT current_academic_year_id AS year_id
      FROM school_profile
      WHERE current_academic_year_id IS NOT NULL
      LIMIT 1
    ) cur
    WHERE s.id = $1::uuid
      AND s.class_id IS NOT NULL
      AND s.archived_at IS NULL
      AND s.active IS DISTINCT FROM false
      AND NOT EXISTS (
        SELECT 1 FROM student_class_assignment a
        WHERE a.student_id = s.id AND a.academic_year_id = cur.year_id
      )
    `,
    [id],
  );
}
