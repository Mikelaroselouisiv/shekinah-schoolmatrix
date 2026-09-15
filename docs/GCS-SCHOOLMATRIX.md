# Stockage fichiers — Google Cloud Storage

Remplace AWS S3 pour SchoolMatrix.

## Bucket

| Clé | Valeur |
|-----|--------|
| Bucket | `gs://shekinah-schoolmatrix-assets` |
| Préfixe fichiers | `schoolmatrix/uploads/`, `schoolmatrix/profiles/`, `schoolmatrix/backups/` |
| Installers (Phase 4) | `installers/remote/`, `installers/server/`, `installers/mobile/` |

## Variables d’environnement

```env
GCS_BUCKET=shekinah-schoolmatrix-assets
GCS_PREFIX=schoolmatrix
GCS_PROJECT_ID=shekinah-schoolmatrix
```

Sur la **VM GCP**, pas de clé JSON : le client utilise l’ADC du compte de service `schoolmatrix-vm@…` (rôle `roles/storage.objectAdmin`).

Sur la **machine Server locale** (installeur) : la clé du SA `schoolmatrix-desktop@…` est **embarquée** au build (`credentials/gcs-sa.json` → `GOOGLE_APPLICATION_CREDENTIALS`). Aucune config manuelle sur site.

## Comportement upload

1. Écriture locale (`STORAGE_ROOT`)
2. Copie vers GCS si `GCS_BUCKET` défini (**obligatoire** en prod multi-nœuds)
3. Métadonnée `file_metadata.s3_key` = clé objet GCS (nom de colonne historique)
4. Valeur renvoyée / stockée en base = **URL publique GCS**  
   `https://storage.googleapis.com/shekinah-schoolmatrix-assets/schoolmatrix/uploads/<fichier>`
5. Chemins legacy `uploads/…` : normalisés au boot + à la sync ; `GET /uploads/<fichier>` redirige vers GCS si absent du disque local

Ainsi Remote et Server affichent la même image sans sync binaire.

S3 AWS n’est plus utilisé sauf si les variables AWS_* sont encore renseignées (legacy).
