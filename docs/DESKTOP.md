# Desktop SchoolMatrix — un seul logiciel

> **DEV quotidien** : [DEV.md](DEV.md) · **3 environnements** : [ENVIRONMENTS.md](ENVIRONMENTS.md) · **Livraison** : [RELEASE.md](RELEASE.md)

Le produit desktop est **entièrement dans** `apps/desktop` (modèle Israel) :

- **UI** : React + Vite + React Router (`src/renderer`), chargée par Electron  
  - Dev : serveur Vite (`http://localhost:5173`)  
  - Installateur : `dist/index.html` (`file://`, HashRouter)
- **Shell** : Electron (`src/main`) — éditions Server / Remote, mise à jour auto, bootstrap Docker Server
- Deux éditions : **Server** (API locale + stack Docker) et **Remote** (API cloud)

| Édition | API |
|--------|-----|
| **Server** | `http://127.0.0.1:3000` (+ stack Docker / sync-agent) |
| **Remote** | `http://34.118.138.96` |

### Machine Server (site école) ≠ machine de développement

- **Dev** (`apps/desktop` + backend en local) : poste du développeur. Ce n’est **pas** la machine d’exploitation.
- **Server école** : reçoit uniquement ce que l’**installeur Server** embarque (`server-stack` : images `.tar`, `defaults.env`, `bootstrap.ps1`, clé GCS). Aucun réglage manuel sur site.

Sur site : installer l’exe **Server** → l’app se lance → tout est automatique :

1. Copie `server-stack` → `C:\ProgramData\Shekinah SchoolMatrix\server-stack`
2. Installe Docker Desktop si besoin (winget)
3. Crée / réaligne `.env.server` depuis `defaults.env` **embarqué** (SYNC_API_KEY, GCS, GEMINI, `SYNC_INTERVAL_MS`, `SYNC_KICK_URL`)
4. Monte `credentials/gcs-sa.json` dans Docker (`GOOGLE_APPLICATION_CREDENTIALS`)
5. Charge les images `.tar` (Postgres + backend + sync-agent) et recreate `backend` + `sync-agent`
6. Tâche planifiée pour remonter la stack à l’ouverture de session

**Aucune édition manuelle de `.env`.** Pour qu’un correctif sync / kick / backend vive à l’école : le **builder dans l’installeur** (`prepare:server-stack` + `dist:win:server` / `ship-all`), puis MAJ auto ou réinstall sur la machine école.

**Piège fréquent :** pousser le backend sur la VM GCP (ou lancer des conteneurs Docker sur le PC de développement) **ne met pas à jour** les Servers école. Seul le contenu de `server-stack/images/*.tar` dans l’exe Server compte. `ship-all` attend donc le CI Artifact Registry avant `dist:win:server`.

Docker reste vide tant que l’app n’a pas démarré une fois (l’installeur NSIS lance l’app en fin d’install).

## Legacy / archive

L’ancien frontend Next.js (`apps/desktop/frontend`) est **legacy / archive** (`ARCHIVE.md`) :

- source de référence pour le portage vers `src/renderer`
- **plus utilisé par Electron** (pas de sidecar Next, pas de `next-runtime`)
- ne pas lancer `npm run dev` dedans pour le produit desktop

L’ancien monde AWS ECR / Electron prod-locale est sous `_archive/legacy-aws-ecr/` — ne pas l’utiliser.

## Dev

Seul le **backend** reste à part (API Nest). L’UI part avec Electron + Vite.

```powershell
# Terminal A — API (Server uniquement ; Remote parle au cloud)
cd shekinah-schoolmatrix-backend
npm run dev
```

```powershell
# Terminal B — logiciel desktop (UI Vite + Electron)
cd apps/desktop
npm install
npm run dev          # Server (Vite :5173 + Electron)
# ou
npm run dev:remote   # Remote
```

## Build installateurs

```powershell
cd apps/desktop
npm run dist:win:remote
npm run dist:win:server
```

Sortie : `apps/desktop/release/`.

Les scripts packagent `dist/**` (renderer Vite) + `src/main/**`. L’édition Server embarque aussi `server-stack/` (images Docker + compose). Aucun `next-runtime` n’est embarqué.

## Livraison (après développement)

Une commande pour GitHub + backend GCP + installateurs (notifications MAJ) :

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-all.ps1 -Bump patch -Commit
```

Voir [RELEASE.md](./RELEASE.md).

## Mises à jour (notification → téléchargement → install)

Les apps **installées** (Remote et Server) vérifient le feed GCS au démarrage (~8 s) puis toutes les 4 h.

1. Bump `version` dans `apps/desktop/package.json` (ex. `1.0.1`)
2. Publier :
   - **GitHub Actions** → workflow **Desktop - release to GCS** (choix `remote` / `server` / `both`)
   - ou tag : `git tag desktop-v1.0.1 && git push origin desktop-v1.0.1`
3. Artefacts uploadés : `latest.yml`, `.exe`, `.blockmap` vers :
   - Remote : `https://storage.googleapis.com/shekinah-schoolmatrix-assets/installers/remote/`
   - Server : `https://storage.googleapis.com/shekinah-schoolmatrix-assets/installers/server/`
4. Sur la machine distante : notification OS + modal in-app → **Télécharger** → **Redémarrer et installer**

En dev (`npm run dev`), les mises à jour sont désactivées (bouton version visible mais feed inactif).

Upload manuel local :

```powershell
cd apps/desktop
npm run dist:win:remote   # ou dist:win:server
cd ../..
powershell -ExecutionPolicy Bypass -File infra/scripts/upload-desktop-installer.ps1 -Edition remote
```
