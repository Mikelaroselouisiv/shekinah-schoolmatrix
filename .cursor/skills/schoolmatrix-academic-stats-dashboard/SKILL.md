---
name: schoolmatrix-academic-stats-dashboard
description: >-
  Rebuilds a SchoolMatrix-style academic statistics dashboard: role-aware
  (teacher vs school leadership), tabbed UX, class/subject/teacher/room
  filters, subject-vs-class comparisons, top students, and scoped discipline.
  Use when the user asks for stats académiques, rendement des classes,
  tableau de bord pédagogique, academic analytics, or the same feature on
  another SchoolMatrix / school ERP fork.
disable-model-invocation: true
---

# Stats académiques — tableau de bord pédagogique

Reconstruire l’onglet **Stats académiques** pour qu’il serve vraiment : lecture
par rôle, onglets clairs, tris, et comparaisons actionnables. Inspiré des
tableaux de bord Pronote / PowerSchool Insights / Infinite Campus (pulse
école + zoom dimension), pas d’un dump de tableaux.

## Quand l’appliquer

- Onglet stats académiques « câblé mais inutile / illisible »
- Professeurs doivent voir **leurs** classes / matières
- Direction doit filtrer **école → classe → matière → professeur**
- Fork SchoolMatrix (Shekinah, Parallele, autre école)

## Produit — deux lentilles

### Direction (`SUPER_ADMIN`, `DIRECTEUR_*`, `SCHOOL_ADMIN`, `CENSEUR`, …)

Bilan école + **barre de filtres persistante** :

- année, période, classe, matière, professeur, salle
- cliquer une ligne = appliquer le filtre (drill-down)
- bouton Réinitialiser

Onglets :

1. **Vue d’ensemble** — Bilan (moyenne + % Admis + donut des décisions), graphiques
2. **Classes** — tri moyenne / % Admis, barres de décisions
3. **Matières** — tri + détail classe × matière
4. **Professeurs** — moyenne selon les affectations `teacher_class_subject`
5. **Élèves** — meilleurs / à accompagner (périmètre filtré)
6. **Discipline** — absences, retards, sanctions, élèves &lt; 70 pts **du périmètre**

### Professeur (`TEACHER` + alias PROFESSEUR / ENSEIGNANT / PROF)

Même API, **périmètre forcé** sur `teacher_id = req.user.userId`.
Pas d’onglet Professeurs, pas de filtre professeur.

Déduire le **profil** à partir des affectations :

| Profil | Règle | Vue prioritaire |
|--------|--------|-----------------|
| `specialist` | 1–2 matières, souvent plusieurs classes | Quelle classe est la plus forte **dans cette matière** |
| `homeroom` | 1 classe/salle, ≥ 3 matières | Quelle matière avance / à renforcer, meilleurs élèves de la salle, discipline de ses élèves |
| `mixed` | le reste | Les deux blocs |
| `none` | 0 affectation | Message : demander le rattachement |

Un prof qui enseigne **toutes les matières d’une seule classe** = `homeroom`.
Un prof de maths dans 4 salles = `specialist`.

## API

`GET /statistics/academic`

Query : `academic_year_id`, `period_id`, `class_id`, `subject_id`, `teacher_id`, `room_id`.

Auth :

- `JwtAuthGuard` + `ParentScopeGuard` + `@DenyParents()`
- `@Roles` direction **et** `TEACHER_ROLE_NAMES`
- Un professeur **ignore** `teacher_id` query (anti-IDOR)
- La direction peut passer `teacher_id` pour voir la lentille d’un prof

Moyennes : **même formule que le carnet** — par période `points/coef × 10`, puis
moyenne des périodes (pas une moyenne brute de toutes les notes).

Seuil de **Admis** : `class_decision_threshold` de l’onglet Notes (par classe /
année), **pas** un 5/10 en dur. Même échelle /10 et mêmes paliers que
formation-classe (`Admis` / `Admis ailleurs` / `Redoubler` / `Ajourné` /
`Renvoyé`). Si une classe n’a pas de ligne, défaut Notes : 10 / 8 / 6 / 4.

Réponse utile (en plus des KPIs existants) :

```ts
viewer: { mode: 'admin' | 'teacher'; profile; teacher_id; assignments[] }
insights: { headline: string; points: string[] }  // titre Bilan seulement, pas de phrases
overview.decisions / by_class.decisions / reference_threshold
by_class_subject[]           // classe × salle × matière
class_comparison_by_subject[]  // pour chaque matière, classes classées
subject_comparison_by_class[]  // pour chaque classe, matières classées
filter_options: { classes, subjects, teachers, rooms }
discipline: { ..., students_low_points }  // scoped aux élèves du filtre
```

Affectations source de vérité : table `teacher_class_subject`
(`teacher_id`, `class_id`, `subject_id`, `room_id` nullable).

Si `room_id` est renseigné, ne compter que les élèves de cette salle.
Les notes n’ont pas de `room_id` : joindre `student.room`.

Discipline : **uniquement les élèves du périmètre** (`In(studentIds)`).
Ne jamais recompter toute l’école pour un prof. Base points = 100 ;
« sous 70 » = alerte.

## UI / UX (desktop Electron)

- Ne **pas** tout empiler dans une page unique.
- Hero **Bilan académique** coloré : moyenne /10, % Admis (seuils école), donut.
- Pas de pavés élèves notés / notes / classes / profs, pas de « répartition &lt;5/5–7… ».
- Couleurs selon le seuil de la classe, pas 5 / 7 / 8,5.
- Graphiques SVG/CSS (pas de lib) : barres moyennes, stacked décisions.
- Tableaux **triables**. Pas de phrases d’explication sous le titre.

Fichiers typiques SchoolMatrix :

- Backend : `src/statistics/statistics.service.ts` + `academic-stats.ts` (calcul pur)
- API : `src/statistics/statistics.controller.ts`
- UI : `apps/desktop/src/renderer/pages/DashboardStatsAcademiquesPage.tsx`
- Nav : `dashboardRoles.ts` — ajouter `TEACHER_ROLE_NAMES` à `stats-academiques`
- Mobile : types + accès ; insights si l’écran existe déjà

Ne pas modifier `apps/desktop/frontend/` (archive).

## Menu & permissions

Deux accès distincts :

- **Professeur** : Stats académiques **toujours** (son périmètre élèves / matières). Pas besoin de case à cocher.
- **Moniteur global** : permission `stats-academiques` dans Gestion des rôles (« Moniteur global de rendement académique »), ou `full_access`, ou rôle direction (`SUPER_ADMIN` / `DIRECTEUR_GENERAL` / `SCHOOL_ADMIN`).

Ne **pas** déduire le moniteur global de `grades` ou `classes`. Censeur / directeur pédagogique ne l’ont pas par défaut : cocher la case si l’école le veut.

## Ordre d’implémentation

1. Extraire le calcul des moyennes / agrégats (fichier dédié, testable).
2. Scoper service + query filters + discipline bornée.
3. Contrôleur : viewer JWT, DenyParents, rôles prof.
4. UI onglets + filtres + drill-down + insights.
5. Nav prof + mobile types.
6. Vérifier : un prof ne voit pas les notes d’une classe non affectée ;
   un admin filtre un prof et retrouve la lentille specialist/homeroom.

## Anti-patterns

- Un seul écran avec 4 tableaux école pour tout le monde
- Discipline globale (toute l’école) sur la vue d’un professeur
- Moyenne = moyenne arithmétique des `grade_value` (ignorer les coefs / périodes)
- `@Roles('TEACHER')` seul sans alias (`PROFESSEUR`, `ENSEIGNANT`, …)
- Laisser un prof passer `teacher_id` d’un collègue
- Charts lourds / couleurs hors charte (`--school-accent-1`)

## Référence SchoolMatrix déjà en place

Sur Shekinah, le calcul vit dans
`shekinah-schoolmatrix-backend/src/statistics/academic-stats.ts`
et l’UI dans `DashboardStatsAcademiquesPage.tsx`. Recopier le **contrat**
et l’UX, pas les chemins GCP / tenant.
