# Livraison SchoolMatrix — comment on développe et on pousse partout

> Avant de publier : développer selon [DEV.md](DEV.md).  
> Ne jamais confondre les 3 cibles : [ENVIRONMENTS.md](ENVIRONMENTS.md).

## Principe

1. **Développer** (backend Nest, `apps/desktop`, sync-agent, docs…)
2. **Quand c’est fini** → une seule commande : `ship-all.ps1`
3. Le pipeline met **à jour partout** :
   - code sur **GitHub** (`origin` → `Mikelaroselouisiv/shekinah-schoolmatrix`)
   - **API cloud** (Artifact Registry + VM `schoolmatrix-api`) — pour les apps **Remote**
   - **installateurs Remote + Server** sur GCS → notifications de MAJ

**Server école ≠ VM GCP ≠ Docker du poste de dev.**  
Le backend/Postgres/sync-agent d’une école ne change que si l’installateur Server embarque de nouveaux `server-stack/images/*.tar` (après CI Artifact Registry), puis l’école installe la MAJ (`bootstrap.ps1` → `docker load`).  
Voir `docs/DESKTOP.md` et `.cursor/rules/server-stack-vs-cloud.mdc`.

## Commande unique

Depuis la racine du repo :

```powershell
# Livraison standard (bump patch, commit+push, build desktop local, upload GCS, trigger backend CI)
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump patch -Commit

# Feature plus large
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump minor -Commit -Message "Ship SchoolMatrix desktop X.Y.0 — …"

# Backend seulement
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump none -Desktop none -Commit -Message "fix: sync"

# Sans Docker local : GitHub Actions build les installateurs
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump patch -Commit -UseCI

# Voir ce qui serait fait
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump patch -Commit -DryRun
```

Prérequis : `gcloud` config `schoolmatrix-shekinah`, `gsutil`, Node 20, Docker (pour Server local), optionnel `gh`.

## Pipelines GitHub Actions

| Workflow | Déclencheur | Effet |
|----------|-------------|--------|
| **Release all** | Actions manuel, ou tag `release-v*` | Backend + desktop Remote/Server |
| **Backend - build and push to GCP** | push `main` (paths backend/infra), manuel, ou appelé par Release all | Image + deploy VM |
| **Desktop - release to GCS** | manuel, ou tag `desktop-v*` | NSIS + `latest.yml` → feeds MAJ |

## Feeds auto-update

- Remote : https://storage.googleapis.com/shekinah-schoolmatrix-assets/installers/remote/latest.yml  
- Server : https://storage.googleapis.com/shekinah-schoolmatrix-assets/installers/server/latest.yml  

Les apps installées notifient → téléchargent → redémarrent.

## Autre machine de dev

```powershell
git clone https://github.com/Mikelaroselouisiv/shekinah-schoolmatrix.git
git pull
# … développer …
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump patch -Commit
```

Ne jamais committer : `secrets/`, `*.pem`, `.env*`, `apps/desktop/release/`, images `.tar`.
