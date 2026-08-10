# Architecture cible — Shekinah SchoolMatrix

> État d’exploitation actuel (DEV / GCP / école) : [ENVIRONMENTS.md](ENVIRONMENTS.md).  
> L’UI desktop est **Electron + Vite** (`apps/desktop`) — plus de sidecar Next en production.

Inspiré de POS Entreprises Israel, avec une règle claire :

## Source de vérité

```text
[ Machine Server (école) ]
  Postgres + API Nest + sync-agent principal
           │
           │  sync (last-write-wins / updatedAt)
           ▼
[ Cloud GCP — miroir ]
  Postgres + API (VM)
           │
     ┌─────┼──────────────┐
     ▼     ▼              ▼
  Remote  Mobile      WordPress
  Electron Expo       (Hostinger)
```

- **Une** source de vérité : le serveur local.
- **Un** agent sync principal : sur la machine Server.
- Online peut recevoir des écritures (Remote / mobile / site) ; elles sont ramenées en local. **Conflit → last-write-wins (`updatedAt`) ; à égalité, biais local.**
- Le cloud sert aussi à offrir une API / capacité offline aux clients distants (pas une 2ᵉ vérité métier).

## Logiciels

| Édition | Contenu |
|---------|---------|
| **Server** | Electron + UI + stack Docker locale (db, api, sync-agent) |
| **Remote** | Electron + UI → API cloud uniquement |
| **Mobile** | Expo → API cloud (+ offline) |
| **WordPress** | Appels API publiques / authentifiées |

## GCP (équivalents AWS)

| Ancien AWS | Nouveau GCP |
|------------|-------------|
| EC2 | Compute Engine VM |
| ECR | Artifact Registry |
| S3 | Cloud Storage |
| Updates | GCS + electron-updater |

## Phases

0. Projet GCP + bootstrap + secrets GitHub — **fait**  
1. Docker cloud (API + Postgres) + CI deploy — **fait** (API miroir live)  
2. Stockage GCS — **fait** (`GcsService`, bucket `shekinah-schoolmatrix-assets`)  
3. Sync-agent (local → cloud, local wins) — **fait** (API `/sync/*` cloud + agent + compose server)  
4. Desktop unifié Server / Remote — **fait** (`apps/desktop`, Next sidecar, updater GCS)  
5. APIs WordPress  
6. Mobile + push FCM  
7. Retrait AWS  
