-- DEV only (schoolmatrix-db-dev). Recale les notes héritées « /20 + coef 1/2/3 »
-- vers le barème haïtien : points obtenus / 100–500, moyenne = points/barème × 10.
-- Idempotent : les notes déjà sur 100+ sont juste ramenées au barème de la matière.

BEGIN;

CREATE TEMP TABLE subj_bareme AS
SELECT
  id,
  CASE
    WHEN name ILIKE '%math%' THEN 500
    WHEN name ILIKE '%physique%' THEN 400
    WHEN name ILIKE '%francais%' OR name ILIKE '%français%' OR name ILIKE '%chimie%' THEN 300
    WHEN name ILIKE '%eps%'
      OR name ILIKE '%civique%'
      OR name ILIKE '%relig%' THEN 100
    ELSE 200
  END AS bareme
FROM subject;

UPDATE class_subject_coefficient c
SET
  coefficient = s.bareme,
  updated_at = NOW()
FROM subj_bareme s
WHERE c.subject_id = s.id;

UPDATE grade g
SET
  coefficient = s.bareme,
  grade_value = CASE
    WHEN g.coefficient::numeric >= 50 THEN
      LEAST(
        s.bareme,
        GREATEST(0, ROUND(g.grade_value::numeric / NULLIF(g.coefficient::numeric, 0) * s.bareme, 0))
      )
    ELSE
      LEAST(
        s.bareme,
        GREATEST(0, ROUND(g.grade_value::numeric / 20.0 * s.bareme, 0))
      )
  END,
  updated_at = NOW()
FROM subj_bareme s
WHERE g.subject_id = s.id;

-- Seuils /10 cohérents avec des moyennes ~5–8 (sinon Admis à 10/10 = personne).
UPDATE class_decision_threshold
SET
  min_average_admis = 5,
  min_average_admis_ailleurs = 4,
  min_average_redoubler = 3,
  min_average_ajourne = 2,
  updated_at = NOW();

COMMIT;
