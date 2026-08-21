# Règles de synchronisation — Shekinah SchoolMatrix

## Topologie

- **Machine Server** : Postgres + API + **un** sync-agent (seul moteur de sync métier).
- **Cloud GCP** : miroir (API + Postgres) pour Remote, mobile, WordPress.
- Édition possible des deux côtés ; convergence par **last-write-wins**.

## Cycle agent

1. **Push tombstones** local → cloud  
2. Pull cloud → local (tombstones cloud en premier dans `ENTITY_ORDER`)  
3. **Push tombstones** encore (deletes survenues pendant le pull)  
4. Push local → cloud (reste)

- Intervalle par défaut : **~5s** (`SYNC_INTERVAL_MS`).
- Kick immédiat : l’API locale POST `SYNC_KICK_URL` (agent `:3911/kick`) après écritures école / utilisateur / upload.

Le `pull` **n’émet pas** les lignes encore en table mais déjà tombstonées (évite de republier une delete incomplète).

**Piège métier** : le provisionnement auto des comptes PARENT ne doit avoir lieu qu’à **l’inscription** élève — pas à chaque MAJ fiche (sinon une suppression de parent est recréée au prochain save). D’où le drapeau `provision` de `ParentAccountService.ensureForStudent`.

## Conflits : last-write-wins

| Situation | Règle |
|-----------|--------|
| `incoming.updatedAt > existing` | Appliquer (créé ou mis à jour) |
| `incoming.updatedAt < existing` | Skip |
| Égalité + apply sur LOCAL depuis cloud | Skip (biais local) |
| Égalité + apply sur CLOUD depuis local | Appliquer |

## SchoolProfile (singleton)

Une seule ligne métier. À l’apply sync : LWW adopte l’UUID gagnant et **supprime les doublons**.  
`getProfile()` lit toujours le plus ancien `created_at` après dédup au démarrage.

**Nouveaux champs établissement** (`address`, `phone`, `email`, `logo_url`, slogan, etc.) **et signatures** (`image_url`, nom, rôle) : un `null`/vide ou une clé absente venant du cloud **n’écrase pas** une valeur locale déjà renseignée. Les lignes `school_signature` sont réassignées vers l’UUID profil gagnant avant suppression des doublons (évite le wipe CASCADE).

## SchoolSignature

Signatures d’établissement (image PNG idéalement sans fond, nom, rôle), enfants de `SchoolProfile` (`school_profile_id`).  
Sync après `SchoolProfile` dans `ENTITY_ORDER`. Les images (`image_url`) suivent le même pipeline GCS / URL publique que les logos.

## Identité

- UUID métier (`id`) = clé de sync (sauf SchoolProfile singleton qui peut changer d’UUID gagnant).
- Filaire : colonnes scalaires + FK ManyToOne comme uuid (via `loadRelationIds`).
- Curseur composite `{ since, afterId }` + horodatage µs Postgres (pas de blocage sur skip).
- Une ligne en erreur dans un lot **n’arrête plus** le curseur : le reste de l’école continue.
- FK **optionnelles** absentes à l’arrivée (ex. `student.room_id`) : on enregistre la ligne **sans** la salle. Inscrire sans salle est valide ; le rattachement se fera au prochain write une fois la salle sync.
- Payload JSON API : **10 Mo** (le défaut Express 100 Ko rejetait un lot d’utilisateurs ~103 Ko → `entity.too.large` et **tout le cycle** — User, élèves, liens — s’arrêtait). Lots agent : 50 lignes.

## Suppressions (tombstones)

Les hard deletes métier sont propagés via `sync_tombstone` (entité **`SyncTombstone`**, toujours **en premier** dans `ENTITY_ORDER`). Ça empêche le rebond : supprimer en local sans tombstone → le cloud rattache la ligne au prochain pull, et inversement.

Même règle LWW que le reste (`deleted_at` vs `updated_at` de la cible ; à égalité, le **local** gagne) :

1. Suppressions ORM (`.remove`) → subscriber + `markDeleted` puis kick agent.
2. L’agent pousse d’abord les tombstones local→cloud, puis pull, puis push du reste.
3. Delete **plus récent** que la ligne → hard delete distant (anti-rebond).
4. Ligne **plus récente** que le tombstone → le write gagne : on **retire** le tombstone et on upsert (nouveau compte après une purge, y compris si l’id serial a été réutilisé). Un vieux delete cloud ne veto pas le Server.
5. Création locale (`createUser`) : `forgetDeleted` pour cet id.

`SchoolProfile` (singleton / dédup) n’utilise pas ce mécanisme.  
Les séquences entières (`users_id_seq`) **n’avancent que** : jamais de `setval(MAX(id))` qui recule après un mass-delete.

Les suppressions faites **avant** le déploiement des tombstones n’en ont pas : les supprimer une fois de l’autre côté, ou re-supprimer après MAJ.

## Append-only

Ne jamais écraser si uuid déjà présent :

- `PaymentTransaction`
- `Attendance`

## Auth

Header `X-Sync-Key: <SYNC_API_KEY>` — même clé sur local, cloud et agent.

## Fichiers / photos

- Upload → GCS + **URL publique** stockée en base (même valeur des deux côtés).
- Legacy `uploads/...` : réécrit en URL GCS au boot / à la sync ; `GET /uploads/x` redirige vers GCS si le fichier n’est pas sur le disque local.
- UI (`getImageUrl`) résout aussi `uploads/...` vers GCS directement.

## Entités V1

Voir `ENTITY_ORDER` dans `apps/sync-agent/src/entities.js` et `SYNC_ENTITY_DEFS` dans le backend.

Ordre notable : **Class avant Room** (`room.class_id` → classe pédagogique ; une classe a plusieurs salles avec `capacity`). **Student** après Room (`student.room_id`, optionnel).

Inclut **`User`** (`password_hash`, photos, `role_id`) ainsi que les rattachements `UserLinkedStudent` / `StudentParent` — sans eux, un parent synchronisé arrive sans aucun enfant. Les rôles sont seedés identiquement (mêmes ids) des deux côtés — pas de sync `Role` en V1.

Conséquence : une école qui **renomme** un rôle (ex. `TEACHER` → `PROFESSEUR`) ne change que son libellé local ; le cloud garde l’ancien nom pour le même `role_id`. Le code ne doit donc **jamais** comparer `role.name === 'TEACHER'` : utiliser `TEACHER_ROLE_NAMES` / `isTeacherRoleName()` (`roles.constants.ts`, porté côté desktop dans `lib/dashboardRoles.ts`).
