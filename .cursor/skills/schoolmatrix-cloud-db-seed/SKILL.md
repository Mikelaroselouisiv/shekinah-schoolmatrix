---
name: schoolmatrix-cloud-db-seed
description: >-
  Bulk-seeds SchoolMatrix cloud Postgres (class fees / économat montants,
  salles/rooms, and similar repetitive métier rows) via gcloud SSH + docker
  psql, then relies on sync-agent cloud→local. Use when the user asks to
  saisir, accélérer, copier des montants de paiement, tranches, inscriptions,
  class_fee, créer des salles, rooms, or write the same data for several
  classes on the base en ligne / GCP of a SchoolMatrix school fork.
---

# Saisie métier cloud SchoolMatrix (frais, salles, etc.)

Tu es dans **un fork école** (prototype ou client). Chaque école a son propre
projet GCP et sa propre VM. **Lis toujours** `docs/GCP-SCHOOLMATRIX.md` du
**workspace ouvert** — jamais un autre tenant.

## Quand l’utiliser

L’utilisateur veut gagner du temps sur des **saisies répétitives** déjà
commencées à la main (ex. « comme la 1re année, fais 2e–9e », « 2 salles par
classe fondamentale »). Tu **n’inventes pas** les tarifs ni les noms : tu
**copies un modèle déjà en base** (ou les chiffres / dates qu’il dicte).

## Isolation (obligatoire)

1. `Project` / `VM` / `zone` = table « Ressources cibles » de
   `docs/GCP-SCHOOLMATRIX.md` **de ce dépôt**.
2. Interdit : Docker Desktop du PC de dev, `shekinah-db-dev`, Postgres
   local Server, VM d’un autre fork.
3. Interdit : coller le project ID / IP d’une autre école dans ce dépôt.
4. Passer `--project` et `--zone` **explicitement** (ne pas se fier au
   `gcloud config` actif — il peut rester sur un autre tenant).

## Connexion (Windows)

Postgres cloud n’écoute que `127.0.0.1:5432` **sur la VM**. SSH IAP obligatoire.

- Binaire : `gcloud.cmd` (pas `gcloud.ps1` — il est lent / peut rester bloqué).
- Conteneur : `shekinah_postgres_cloud` (user/db par défaut `schoolmatrix`).
- Timeout SSH : 120–180 s.

**Toujours** passer par le script du skill (évite le quoting PowerShell) :

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.cursor\skills\schoolmatrix-cloud-db-seed\scripts\run-cloud-sql.ps1" -SqlFile .\tmp-query.sql
```

Si le skill n’est que dans le repo :

```powershell
powershell -ExecutionPolicy Bypass -File .cursor\skills\schoolmatrix-cloud-db-seed\scripts\run-cloud-sql.ps1 -SqlFile .\tmp-query.sql
```

Le script lit `docs/GCP-SCHOOLMATRIX.md`, SCP le `.sql`, exécute via
`docker exec -i … psql`, puis **efface** le fichier distant.

Fichiers `tmp-*.sql` **locaux** : les supprimer après succès, **ne pas committer**.

## Sync (les écritures SQL cloud **arrivent** au Server école)

Le sync-agent (machine Server) fait : **1) pull cloud → local  2) push local → cloud**
(~5 s). Protocole **état** (`updated_at` / `created_at`), pas « saisi par un humain ».

| Entité | Table | Curseur | Sync ? |
|--------|--------|---------|--------|
| `ClassFee` | `class_fee` | `updated_at` | oui |
| `Room` | `room` | `updated_at` | oui |
| `FeeService` | `fee_service` | `updated_at` | oui |
| `Class` | `class` | `updated_at` | oui |
| `PaymentTransaction` | `payment_transaction` | `created_at` | oui mais **append-only** — ne pas bulk-créer des paiements élèves |

Mettre `created_at` **et** `updated_at` à `now()` sur chaque INSERT.

Remote voit les lignes tout de suite (API cloud). Server école : dès que
l’agent sync tourne. Si l’école n’a pas l’agent allumé, les données restent
sur le cloud jusqu’au prochain cycle.

## Workflow (toujours)

```
- [ ] 1. Lire docs/GCP-SCHOOLMATRIX.md (project, VM, zone)
- [ ] 2. INVENTAIRE SQL (classes, services, frais, salles) — ne rien écrire
- [ ] 3. Identifier le modèle (classe déjà saisie / consignes user)
- [ ] 4. INSERT idempotent (NOT EXISTS) dans une TRANSACTION
- [ ] 5. SELECT de vérif + compter les lignes
- [ ] 6. Supprimer tmp-*.sql local + confirmer à l’utilisateur
```

**Ne pas** créer de `fee_service` extra (fête, MENFP, …) sauf demande explicite.
**Ne pas** deviner `academic_year` via la date du jour : recopier l’année des
lignes modèle déjà en base (souvent l’année scolaire **à venir**, pas
`getCurrentAcademicYear()`).

## Inventaire (étape 2)

```sql
SELECT id, name, level, section, active FROM class ORDER BY name;

SELECT id, name, code, nature, active FROM fee_service ORDER BY name;

SELECT c.name AS class_name, fs.name AS service_name, cf.academic_year,
       cf.amount, cf.due_date, cf.id
FROM class_fee cf
JOIN class c ON c.id = cf.class_id
JOIN fee_service fs ON fs.id = cf.service_id
ORDER BY c.name, fs.name;

SELECT r.name AS room_name, r.capacity, r.active, c.name AS class_name
FROM room r
LEFT JOIN class c ON c.id = r.class_id
ORDER BY c.name NULLS LAST, r.name;
```

Les **noms de classes** et **ids de services** changent d’une école à l’autre.
Toujours `SELECT` puis interpoler les UUID **réels** de **cette** base.

## Recette A — montants `class_fee`

Table : `class_fee` (`academic_year`, `class_id`, `service_id`, `amount`,
`due_date`, `detail`). Pas d’unicité SQL : l’API refuse les doublons, donc
**`NOT EXISTS`** sur `(academic_year, class_id, service_id)`.

1. Prendre une classe **déjà complète** comme modèle (montants + échéances).
2. Recopier vers les classes demandées. Si une ligne existe déjà (ex. seule
   l’inscription de 2e est saisie), `NOT EXISTS` la saute.

Modèle SQL (adapter UUID services + `name IN (...)` + montants) :

```sql
BEGIN;

INSERT INTO class_fee (id, academic_year, class_id, service_id, amount, due_date, detail, created_at, updated_at)
SELECT gen_random_uuid(),
       '2026-2027',          -- recopier l’année du modèle
       c.id,
       s.service_id,
       s.amount,
       s.due_date,
       NULL,
       now(),
       now()
FROM class c
CROSS JOIN (
  VALUES
    ('<UUID-inscription>'::uuid, 1000.00,  '2026-07-31'::date),
    ('<UUID-1ere-tranche>'::uuid, 25000.00, '2026-08-14'::date),
    ('<UUID-2eme-tranche>'::uuid, 12500.00, '2026-10-16'::date),
    ('<UUID-3eme-tranche>'::uuid, 12500.00, '2027-01-14'::date),
    ('<UUID-4eme-tranche>'::uuid, 10000.00, '2027-04-15'::date)
) AS s(service_id, amount, due_date)
WHERE c.name IN ('2eme Annee Fondamentale', '3eme Annee Fondamentale' /* … */)
AND NOT EXISTS (
  SELECT 1 FROM class_fee cf
  WHERE cf.class_id = c.id
    AND cf.service_id = s.service_id
    AND cf.academic_year = '2026-2027'
);

COMMIT;
```

Grilles **fréquentes** (Haïti / Parallele — **vérifier** sur le modèle de
l’école, ne pas coller en aveugle) :

| Groupe | Inscription | 1re | 2e | 3e | 4e |
|--------|-------------|-----|----|----|-----|
| Fondamentale 1re–9e + CP | 1000 | 25000 | 12500 | 12500 | 10000 |
| NS1–NS4 | 1000 | 25000 | 15000 | 15000 | 10000 |

Échéances : **identiques partout** si l’utilisateur le dit — copier celles du
modèle (pas celles d’une autre classe préscolaire si elles diffèrent d’un jour).

## Recette B — salles `room`

Une **classe** pédagogique a **plusieurs salles**. Noms préscolaire constatés :
`'1'`, `'2'`, `'3'`… (pas « Salle 1 »). Lier `room.class_id`.

`capacity` : `NULL` (illimité) sauf si l’utilisateur donne un effectif max.

```sql
BEGIN;

-- 2 salles par classe fondamentale
INSERT INTO room (id, name, description, capacity, class_id, active, created_at, updated_at)
SELECT gen_random_uuid(), s.room_name, NULL, NULL, c.id, true, now(), now()
FROM class c
CROSS JOIN (VALUES ('1'), ('2')) AS s(room_name)
WHERE c.name IN ('CP', '1ere Annee Fondamentale' /* … 9eme */)
AND NOT EXISTS (
  SELECT 1 FROM room r WHERE r.class_id = c.id AND r.name = s.room_name
);

-- 1 salle pour le secondaire
INSERT INTO room (id, name, description, capacity, class_id, active, created_at, updated_at)
SELECT gen_random_uuid(), '1', NULL, NULL, c.id, true, now(), now()
FROM class c
WHERE c.name IN ('NS1', 'NS2', 'NS3', 'NS4')
AND NOT EXISTS (
  SELECT 1 FROM room r WHERE r.class_id = c.id AND r.name = '1'
);

COMMIT;
```

Orthographe des `class.name` : **exactement** celle du `SELECT` inventaire
(`1ere Annee Fondamentale`, `NS1`, `Petite Section`, …).

## Recette C — autre table métier

Même méthode : inventaire → modèle → INSERT `gen_random_uuid()` + `now()` +
`NOT EXISTS`. Vérifier que l’entité est dans `SYNC_ENTITY_DEFS`
(`shekinah-schoolmatrix-backend/src/sync/sync.entities.ts` ou équivalent du
fork, dossier `*-schoolmatrix-backend`). Si elle n’y est **pas**, prévenir
l’utilisateur : le Server école **ne** la recevra **pas**.

## Compte rendu utilisateur

- Quoi (classes / services / salles), combien de lignes `INSERT 0 N`
- Grille montants / noms de salles
- Sync : Remote immédiat ; Server dès que l’agent tourne
- Ce qui n’a **pas** été touché (préscolaire déjà fait, services extra, CP, …)

## Anti-patterns

- Écrire dans le Postgres **dev** ou le Docker du laptop
- Utiliser le projet GCP Parallele depuis un fork client (ou l’inverse)
- Recréer des `fee_service` qui existent déjà (matcher sur `name`)
- Bulk `payment_transaction` (paiements élèves)
- Deviner l’année scolaire ou les échéances
- Laisser des `tmp-*.sql` dans git
- Citer un autre client / IP / project ID dans le dépôt courant
