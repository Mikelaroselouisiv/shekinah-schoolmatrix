# Shekinah SchoolMatrix

Logiciel scolaire : **API NestJS** + **desktop Electron** (éditions Server / Remote) + **agent de sync** + miroir cloud **GCP**.

## Trois environnements (ne jamais les mélanger)

| Environnement | Rôle | Comment ça vit |
|---------------|------|----------------|
| **DEV** (cette machine) | Coder et tester | Nest + Vite/Electron en local ; Postgres Docker `shekinah-db-dev` uniquement |
| **CLOUD GCP** | API pour Remote / apps / site | Image Artifact Registry → VM `schoolmatrix-api` (`34.118.138.96`) |
| **SERVER école** | Vérité locale sur site | Installateur `SchoolMatrix Server` → images `.tar` dans Docker **de l’école** |

> Déployer sur GCP ou faire tourner Docker « Server » sur le PC de dev **ne met pas à jour** les écoles.  
> Voir [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

## Démarrer en développement

Guide détaillé : [docs/DEV.md](docs/DEV.md).

```powershell
# Terminal A — Postgres DEV (port 5436) + API Nest (:3000)
npm run dev:backend

# Terminal B — UI Electron (édition Server → API locale)
npm run dev:desktop

# Optionnel — tester la sync SANS toucher la VM GCP
npm run dev:backend:cloud   # miroir local :3001 / Postgres :5437
npm run dev:sync-lab        # agent :3000 ↔ :3001
```

| Besoin | Dossier / commande |
|--------|-------------------|
| Backend | `shekinah-schoolmatrix-backend` → `npm run dev` |
| Frontend (Electron) | `apps/desktop` → `npm run dev` ou `npm run dev:remote` |
| Sync lab (local) | `npm run dev:sync-lab` — **pas** `dev:sync-agent` (ça pointe GCP) |
| Livraison prod | `infra/scripts/ship-all.ps1` (voir [docs/RELEASE.md](docs/RELEASE.md)) |

## Carte du dépôt (canonique)

```
shekinah-schoolmatrix-backend/   ← API Nest (dev + source de l’image Docker)
apps/desktop/                     ← Produit Electron (UI Vite + Server/Remote)
apps/desktop/server-stack/        ← Bundle installateur école (pas pour le quotidien DEV)
apps/sync-agent/                  ← Agent de synchronisation
infra/docker/                     ← Compose GCP + référence Server (ops / CI)
infra/scripts/                    ← ship-all, deploy GCP, upload GCS
dev/                              ← Compose Postgres DEV + utilitaires poste de dev
docs/                             ← Documentation
_archive/                         ← Ancien monde AWS/ECR/Next — ne pas utiliser
```

## Ce qu’il ne faut PAS lancer en DEV quotidien

- `_archive/**` (Electron ECR, scripts prod-local, compose Next)
- `apps/desktop/frontend` (Next.js **archive** — portage uniquement)
- `infra/docker/docker-compose.gcp.yml` sur le laptop
- Stack Server Docker sur le PC de dev **en même temps** que Nest (`:3000` déjà pris) — voir `npm run dev:free-port`
- `ship-all` / upload GCS sauf intention de **publier**

## Agence — dupliquer pour une nouvelle école

Ce dépôt est le **prototype Parallele**. Pour créer un SchoolMatrix isolé pour une autre école (Shekinah, etc.) : [docs/AGENCY-TENANT-CLONE.md](docs/AGENCY-TENANT-CLONE.md) et le skill `.cursor/skills/schoolmatrix-tenant-clone/`.

## Livraison production

Quand le travail est fini et prêt à partir partout :

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump patch -Commit
```

Détails : [docs/RELEASE.md](docs/RELEASE.md) · Desktop : [docs/DESKTOP.md](docs/DESKTOP.md) · GCP : [docs/GCP-SCHOOLMATRIX.md](docs/GCP-SCHOOLMATRIX.md).
