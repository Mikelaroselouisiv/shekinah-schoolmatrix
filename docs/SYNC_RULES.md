# Règles de synchronisation — Shekinah SchoolMatrix

## Topologie

- **Machine Server** : Postgres + API + **un** sync-agent (seul moteur de sync métier).
- **Cloud GCP** : miroir (API + Postgres) pour Remote, mobile, WordPress.
- Édition possible des deux côtés ; convergence par **last-write-wins**.

## Cycle agent

1. Pull cloud → local  
2. Push local → cloud  

- Intervalle par défaut : **~5s** (`SYNC_INTERVAL_MS`).
- Kick immédiat : l’API locale POST `SYNC_KICK_URL` (agent `:3911/kick`) après écritures école / utilisateur / upload.

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
- Pas de soft-delete généralisé en V1 (`deletedAt` toujours `null`).

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

Ordre notable : **Class avant Room** (`room.class_id` → classe pédagogique ; une classe a plusieurs salles avec `capacity`). **Student** après Room (`student.room_id`).

Inclut **`User`** (`password_hash`, photos, `role_id`). Les rôles sont seedés identiquement (mêmes ids) des deux côtés — pas de sync `Role` en V1.
