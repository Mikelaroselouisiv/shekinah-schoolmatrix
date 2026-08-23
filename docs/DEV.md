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
| Port hôte | **5436** → 5432 conteneur |
| Compose | `dev/docker-compose.postgres.yml` |
| Env Nest | `shekinah-schoolmatrix-backend/.env.dev` (copie de `.env.dev.example`) |

```powershell
npm run dev:db          # up -d
npm run dev:db:down     # stop
```

`npm run dev` du backend appelle déjà `docker start shekinah-db-dev`, et crée le conteneur via le compose DEV s’il n’existe pas.

> Sur cette machine, les ports 5432–5434 sont souvent pris par d’autres projets (POS). D’où **5436** pour SchoolMatrix DEV.

## Tester la sync (lab local — recommandé)

Le seed DEV et tes clics UI sont dans `shekinah-db-dev`. **`npm run dev:sync-agent` pointe vers la VM GCP** (`34.118.138.96`) : ça enverrait élèves / parents fictifs en production. Ne pas l’utiliser pour tester un jeu de données local.

Lab à deux nœuds **sur ce PC** :

| Nœud | API | Postgres |
|------|-----|----------|
| LOCAL (vérité) | `http://127.0.0.1:3000` | `shekinah-db-dev` :5436 |
| Miroir « cloud » | `http://127.0.0.1:3001` | `shekinah-db-cloud-dev` :5437 |

```powershell
# Terminal A — déjà ton backend DEV
npm run dev:backend

# Terminal B — miroir vide (Nest + Postgres 5437)
npm run dev:backend:cloud

# Terminal C — agent LOCAL → miroir local (refuse la VM GCP)
npm run dev:sync-lab

# Optionnel : Electron Remote contre le miroir :3001 (pas la VM)
npm run dev:desktop:remote:lab
```

### Lab sync : deux API + deux fronts (simultanés)

| Rôle | API | Vite | Commandes |
|------|-----|------|-----------|
| École (Server) | `:3000` | `:5173` | `dev:backend` + `dev:desktop` |
| Miroir (Remote) | `:3001` | `:5174` | `dev:backend:mirror` + `dev:desktop:mirror` |
| Agent | — | — | `cd apps\sync-agent` puis `npm run start:lab` |

```powershell
npm run dev:free-lab         # libère 3000, 3001, 5173, 5174, 3911
npm run dev:backend          # Terminal A
npm run dev:backend:mirror   # Terminal B
npm run dev:desktop          # Terminal C — école
npm run dev:desktop:mirror   # Terminal D — miroir
# Terminal E — apps/sync-agent → npm run start:lab
```

Après un cycle (~5 s), les comptes `systeme12` et les élèves du seed apparaissent sur `:3001`. Une saisie sur Server (`:3000`) doit arriver sur Remote lab.

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
| `npm run dev:sync-agent` avec le seed fictif | Pousse vers la **VM Shekinah** — utiliser `dev:sync-lab` |
| Laisser `shekinah_api_server` sur `:3000` + Nest en parallèle | Collision + confusion prod/dev |
| Croire que Docker Desktop = école | L’école a son propre Docker, alimenté par l’installeur |
| `ship-all` / upload GCS par erreur | Publie en production |

## Après le code — publication

Voir [RELEASE.md](RELEASE.md). En résumé :

```powershell
powershell -ExecutionPolicy Bypass -File infra\scripts\ship-all.ps1 -Bump patch -Commit
```
