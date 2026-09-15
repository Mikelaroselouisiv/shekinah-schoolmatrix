---
name: schoolmatrix-academic-stats-dashboard
description: >-
  Reconstruit le tableau de bord Stats académiques SchoolMatrix : lecture par
  rôle (professeur vs direction), onglets, filtres classe / matière /
  professeur / salle, comparaisons matière × classe, meilleurs élèves et
  discipline bornée au périmètre. Use when the user asks for stats académiques,
  bilan académique, rendement des classes, tableau de bord pédagogique, or
  academic analytics.
disable-model-invocation: true
---

# Stats académiques — tableau de bord pédagogique

Faire de l’onglet **Stats académiques** un outil de lecture : périmètre par rôle,
onglets clairs, tris et comparaisons actionnables. Inspiré des tableaux de bord
type Pronote / PowerSchool Insights (pulse école puis zoom sur une dimension),
pas d’un empilement de tableaux.

## Quand l’appliquer

- Onglet stats « câblé mais illisible »
- Les professeurs doivent voir **leurs** classes et matières
- La direction doit filtrer **école → classe → matière → professeur → salle**

## Produit — deux lentilles

### Direction (`SUPER_ADMIN`, `DIRECTEUR_*`, `ADMINISTRATEUR`, `SCHOOL_ADMIN`, `CENSEUR`…)

Bilan école + barre de filtres persistante (année, période, classe, matière,
professeur, salle). Cliquer une ligne applique le filtre ; bouton Réinitialiser.

Onglets :

1. **Vue d’ensemble** — moyenne, % Admis, donut des décisions, graphiques
2. **Classes** — tri moyenne / % Admis, barres de décisions
3. **Matières** — tri + détail classe × matière
4. **Professeurs** — moyenne selon `teacher_class_subject`
5. **Élèves** — meilleurs et à accompagner, dans le périmètre filtré
6. **Discipline** — absences, retards, sanctions, élèves sous le seuil **du périmètre**

### Professeur (`TEACHER` + alias `PROFESSEUR` / `ENSEIGNANT` / `PROF`)

Même API, périmètre **forcé** sur `teacher_id = req.user.userId`. Pas d’onglet
Professeurs, pas de filtre professeur.

Profil déduit des affectations :

| Profil | Règle | Vue prioritaire |
|--------|-------|-----------------|
| `specialist` | 1–2 matières, souvent plusieurs classes | Quelle classe est la plus forte dans cette matière |
| `homeroom` | 1 classe/salle, ≥ 3 matières | Quelle matière avance, meilleurs élèves, discipline de sa salle |
| `mixed` | le reste | Les deux blocs |
| `none` | 0 affectation | Message : demander le rattachement |

## API

`GET /statistics/academic`

Query : `academic_year_id`, `period_id`, `class_id`, `subject_id`, `teacher_id`, `room_id`.

Auth :

- `JwtAuthGuard` + `ParentScopeGuard` + `RolesGuard`, et `@DenyParents()`
- `@Roles` direction **et** `TEACHER_ROLE_NAMES`
- Un professeur **ignore** le `teacher_id` de la query (anti-IDOR)
- La direction peut passer `teacher_id` pour voir la lentille d’un professeur

Moyennes : **même formule que le carnet** — par période `points / barème × 10`,
puis moyenne des périodes. Jamais une moyenne brute de toutes les notes.
Le barème vient de `resolveBareme` (`src/grades/grade-scale.ts`), donc les
notes sur 100 à 500 se convertissent comme dans l’onglet Notes.

Seuil d’**Admis** : `class_decision_threshold` par classe et année, pas un 5/10
en dur. Mêmes paliers que formation-classe (`Admis` / `Admis ailleurs` /
`Redoubler` / `Ajourné` / `Renvoyé`). Sans ligne en base, défaut 10 / 8 / 6 / 4.

Périmètre par cycle : passer par `LevelScopeService` (`src/auth/level-scope.service.ts`).
Un rôle borné à `education_levels` ne doit voir ni les classes, ni les élèves,
ni la discipline, ni les options de filtres hors de ses cycles.

Réponse utile :

```ts
viewer: { mode: 'admin' | 'teacher'; profile; teacher_id; assignments[] }
insights: { headline: string; points: string[] }
overview: { …, decisions, reference_threshold }
by_class[] / by_subject[] / by_teacher[] / by_class_subject[]
class_comparison_by_subject[]   // pour chaque matière, classes classées
subject_comparison_by_class[]   // pour chaque classe, matières classées
top_students[] / bottom_students[]
discipline: { …, students_low_points }
filter_options: { classes, subjects, teachers, rooms }
```

Affectations source de vérité : `teacher_class_subject` (`teacher_id`,
`class_id`, `subject_id`, `room_id` nullable) et `class_teacher` pour le
titulaire. Si `room_id` est renseigné, ne compter que les élèves de cette salle ;
les notes n’ont pas de `room_id`, joindre `student.room`.

Discipline : **uniquement les élèves du périmètre** (`In(studentIds)`). Ne jamais
recompter toute l’école sur la vue d’un professeur.

## UI / UX (desktop Electron)

- Ne pas tout empiler dans une page unique : onglets.
- Hero **Bilan académique** : moyenne /10, % Admis selon les seuils école, donut.
- Couleurs selon le seuil de la classe, pas des paliers en dur.
- Graphiques SVG/CSS, pas de librairie de charts.
- Tableaux triables, sans phrase d’explication sous le titre.

Fichiers :

- Calcul pur : `shekinah-schoolmatrix-backend/src/statistics/academic-stats.ts`
- Service : `.../src/statistics/statistics.service.ts`
- API : `.../src/statistics/statistics.controller.ts`
- UI : `apps/desktop/src/renderer/pages/DashboardStatsAcademiquesPage.tsx`
- Nav : `apps/desktop/src/renderer/lib/dashboardRoles.ts`

Ne pas modifier `apps/desktop/frontend/` (archive Next.js).

## Menu & permissions

- **Professeur** : Stats académiques **toujours** visible (son périmètre). Pas de case à cocher.
- **Moniteur global** : permission `stats-academiques` dans Gestion des rôles, ou `full_access`, ou rôle direction.

Ne pas déduire le moniteur global de `grades` ou `classes`. Censeur et directeur
pédagogique ne l’ont pas par défaut : cocher la case si l’école le veut.

## Ordre d’implémentation

1. Extraire le calcul des moyennes et agrégats dans un fichier dédié, testable.
2. Scoper le service : filtres query, périmètre cycle, discipline bornée.
3. Contrôleur : viewer JWT, `DenyParents`, rôles professeur.
4. UI onglets + filtres + drill-down.
5. Vérifier : un professeur ne voit pas une classe non affectée ; un admin
   filtre un professeur et retrouve la lentille `specialist` / `homeroom` ; un
   rôle borné à un cycle ne remonte pas à l’école entière.

## Anti-patterns

- Un seul écran avec quatre tableaux école pour tout le monde
- Discipline de toute l’école sur la vue d’un professeur
- Moyenne = moyenne arithmétique des `grade_value` (coefficients et périodes ignorés)
- `@Roles('TEACHER')` seul, sans les alias
- Laisser un professeur passer le `teacher_id` d’un collègue
