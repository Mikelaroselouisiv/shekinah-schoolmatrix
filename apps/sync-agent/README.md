# SchoolMatrix sync-agent

- **École (prod)** : conteneur Docker via l’installateur Server (`server-stack`).
- **DEV** : process Node local optionnel pour tester la sync (voir [docs/DEV.md](../../docs/DEV.md)).

Cycle (~5s) + kick HTTP :

1. Pull cloud → local (last-write-wins sur `updatedAt`)
2. Push local → cloud

`POST /kick` (port `SYNC_KICK_PORT`, défaut 3911) déclenche un cycle immédiat.

## Variables

| Variable | Défaut | Rôle |
|----------|--------|------|
| `LOCAL_API_URL` | `http://127.0.0.1:3000` | API locale |
| `REMOTE_API_URL` | `http://34.118.138.96` | API GCP |
| `SYNC_API_KEY` | *(requis)* | Header `X-Sync-Key` |
| `SYNC_INTERVAL_MS` | `5000` | Période de secours |
| `SYNC_NODE_ID` | `local-mother` | `sourceNodeId` du push |
| `SYNC_KICK_PORT` | `3911` | HTTP kick / health |

## Dev

```powershell
cd apps/sync-agent
npm install
$env:SYNC_API_KEY="..."
$env:LOCAL_API_URL="http://127.0.0.1:3000"
$env:REMOTE_API_URL="http://34.118.138.96"
npm start
```
