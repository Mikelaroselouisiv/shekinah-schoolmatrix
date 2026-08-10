# Développement SchoolMatrix

Poste développeur uniquement. Pour la logique des 3 environnements : [ENVIRONMENTS.md](ENVIRONMENTS.md).

## Prérequis

- Node.js 20+
- Docker Desktop (pour Postgres DEV)
- Depuis la racine du repo : `npm install` dans `shekinah-schoolmatrix-backend` et `apps/desktop` (une fois)

## Lancer (recommandé)

Depuis la **racine** du dépôt :

```powershell
# 1) S’assurer que le stack « Server école » n’occupe pas :3000 sur ce PC
npm run dev:free-port

# 2) API (démarre shekinah-db-dev si besoin, puis Nest --watch)
npm run dev:backend

# 3) Desktop Electron édition Server (API http://127.0.0.1:3000)
npm run dev:desktop
```

Édition Remote (UI locale, API cloud) :

```powershell
npm run dev:desktop:remote
```

### Équivalent par dossier

```powershell
# Terminal A
cd shekinah-schoolmatrix-backend
npm run dev

# Terminal B
cd apps\desktop
npm run dev
```

## Postgres DEV

| | |
|--|--|
| Conteneur | `shekinah-db-dev` |
| Port hôte | **5435** → 5432 conteneur |
| Compose | `dev/docker-compose.postgres.yml` |
| Env Nest | `shekinah-schoolmatrix-backend/.env.dev` (copie de `.env.dev.example`) |

```powershell
npm run dev:db          # up -d
npm run dev:db:down     # stop
```

`npm run dev` du backend appelle déjà `docker start shekinah-db-dev`, et crée le conteneur via le compose DEV s’il n’existe pas.

> Sur cette machine, les ports 5432–5434 sont souvent pris par d’autres projets (POS). D’où **5435** pour SchoolMatrix DEV.

## Sync-agent (optionnel)

Uniquement pour développer / tester la synchronisation. Pas nécessaire pour l’UI quotidienne.

```powershell
cd apps\sync-agent
npm install
$env:SYNC_API_KEY="..."          # même clé que LOCAL + CLOUD
$env:LOCAL_API_URL="http://127.0.0.1:3000"
$env:REMOTE_API_URL="http://34.118.138.96"
npm start
```

Ou depuis la racine : `npm run dev:sync-agent` (après avoir exporté les variables d’environnement).

Sur une **école**, l’agent tourne dans Docker via l’installateur — pas comme process Node hôte.

## Frontend : un seul produit

| Chemin | Statut |
|--------|--------|
| `apps/desktop` | **Canonique** — Electron + React/Vite (`src/renderer`) |
| `apps/desktop/frontend` | **Archive Next.js** — référence de portage uniquement |

Ne pas lancer `npm run dev` dans `apps/desktop/frontend` pour le produit.

## Ne pas faire en DEV

| Action | Pourquoi |
|--------|----------|
| Utiliser `_archive/` | Ancien AWS/ECR/Electron local-prod |
| `docker compose -f infra/docker/docker-compose.gcp.yml …` sur le laptop | Définition **cloud** |
| Laisser `shekinah_api_server` sur `:3000` + Nest en parallèle | Collision + confusion prod/dev |
| Croire que Docker Desktop = école | L’école a son propre Docker, alimenté par l’installeur |
| `ship-all` / upload GCS par erreur | Publie en production |

## Après le code — publication

Voir [RELEASE.md](RELEASE.md). En résumé :

```powershell
powershell -ExecutionPolicy Bypass -File infra\scripts\ship-all.ps1 -Bump patch -Commit
```
