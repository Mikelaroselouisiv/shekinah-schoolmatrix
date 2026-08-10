# SchoolMatrix Desktop (produit)

Application **Electron** + UI **React/Vite** (`src/renderer`).

## Éditions

| Commande | Édition | API |
|----------|---------|-----|
| `npm run dev` | Server | `http://127.0.0.1:3000` (Nest local) |
| `npm run dev:remote` | Remote | cloud `http://34.118.138.96` |

## Prérequis DEV

1. Backend Nest + Postgres DEV — voir [docs/DEV.md](../../docs/DEV.md)
2. Si `:3000` est pris par `shekinah_api_server` : `npm run dev:free-port` à la racine

## Ne pas utiliser ici

| Chemin | Pourquoi |
|--------|----------|
| `frontend/` | Archive Next.js (portage) — pas le runtime Electron |
| `server-stack/` | Bundle **installateur école** — pas le quotidien DEV |

## Build / livraison

Voir [docs/DESKTOP.md](../../docs/DESKTOP.md) et [docs/RELEASE.md](../../docs/RELEASE.md).
