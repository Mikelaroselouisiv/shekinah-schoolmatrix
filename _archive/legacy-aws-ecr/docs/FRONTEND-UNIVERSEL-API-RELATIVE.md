# Frontend universel — URL API relative `/api` et reverse proxy

## Objectif

Une seule image Docker frontend, buildée une fois et poussée vers ECR, utilisable en local et sur EC2 sans rebuild par environnement :

- Plus d’IP/host fixe dans `NEXT_PUBLIC_API_URL`.
- Le frontend appelle le backend via une URL **relative** de type `/api`.
- Nginx (ou le reverse proxy) route `/` vers le frontend et `/api` vers le backend.
- Une seule image frontend et une seule image backend pour tous les environnements.

---

## 1. Où et comment le frontend appelle actuellement l’API

### Point central : `src/lib/api.ts`

Tous les appels passent par :

- **`API_BASE`** : base URL pour les requêtes (auth, CRUD, etc.).
- **`getImageUrl(storedUrl)`** : URL complète pour afficher les images (uploads servis par le backend).
- **`fetchWithAuth(url, options)`** : `fetch` avec token Bearer.

Logique actuelle :

- **Côté navigateur** : `API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"` (variable injectée au **build** pour Next.js).
- **Côté serveur (SSR)** : `API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"` (pour les fetch depuis le conteneur Next.js vers le backend).

Les pages construisent les URLs ainsi : `${API_BASE}/classes`, `${API_BASE}/auth/login`, etc. Certaines pages redéfinissent localement `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"` au lieu d’importer depuis `api.ts`.

### Flux des requêtes

- **Navigateur** → `fetch(NEXT_PUBLIC_API_URL + "/classes")` → backend (origine différente si host/port différent → CORS).
- **SSR (conteneur web)** → `fetch(API_INTERNAL_URL + "/classes")` → conteneur API (réseau Docker).
- **Images** : `<img src={getImageUrl(...)} />` → `NEXT_PUBLIC_API_URL + "/uploads/xxx"` → backend.

---

## 2. Fichiers où `NEXT_PUBLIC_API_URL` est utilisé

### Frontend (code)

| Fichier | Usage |
|---------|--------|
| `src/lib/api.ts` | Définition de `API_BASE` et base dans `getImageUrl` (navigateur + serveur). |
| `src/app/dashboard/fiche-eleve/page.tsx` | `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"` + appels. |
| `src/app/dashboard/school/page.tsx` | Idem. |
| `src/app/dashboard/classes/page.tsx` | Idem. |
| `src/app/dashboard/page.tsx` | Importe `API_BASE` depuis `api.ts` (pas de redéfinition). |
| `src/app/dashboard/subjects/page.tsx` | Redéfinition locale de `API_BASE`. |
| `src/app/dashboard/moniteur-finance/page.tsx` | Idem. |
| `src/app/dashboard/schedule/page.tsx` | Idem. |
| `src/app/dashboard/grades/page.tsx` | Idem. |
| `src/app/dashboard/comptabilite/page.tsx` | Idem. |
| `src/app/dashboard/depenses/page.tsx` | Idem. |
| `src/app/dashboard/students/page.tsx` | Idem. |
| `src/app/dashboard/academic-years/page.tsx` | Idem. |
| `src/app/dashboard/students/import/page.tsx` | Idem. |
| `src/app/dashboard/teachers/page.tsx` | Idem. |
| `src/app/dashboard/formation-classe/page.tsx` | Idem. |
| `src/app/dashboard/discipline/page.tsx` | Idem. |
| `src/app/dashboard/economat/page.tsx` | Idem. |
| `src/app/dashboard/users/page.tsx` | Idem. |
| `src/components/ImageUpload.tsx` | Utilise `API_BASE` depuis `api.ts` pour `POST /uploads`. |
| `src/components/AppShell.tsx` | Utilise `getImageUrl` depuis `api.ts`. |
| `src/contexts/SchoolProfileContext.tsx` | Utilise `API_BASE` depuis `api.ts`. |
| `src/app/login/page.tsx` | Utilise `API_BASE` depuis `api.ts`. |
| `src/app/signup/page.tsx` | Utilise `API_BASE` depuis `api.ts`. |

### Build / déploiement

| Fichier | Usage |
|---------|--------|
| `shekinah-schoolmatrix-frontend/Dockerfile` | `ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:3000` + `ENV NEXT_PUBLIC_API_URL=...` au build. |
| `docker-compose.yml` | Build-arg et env `NEXT_PUBLIC_API_URL=http://127.0.0.1:3000` pour le service `web`. |
| `docker-compose.prod-local.yml` | Idem. |
| `docker-compose.prod-local-ecr.yml` | Env runtime `NEXT_PUBLIC_API_URL: http://127.0.0.1:3000` pour `web`. |
| `.github/workflows/build-push-ecr.yml` | `--build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:3000` pour l’image frontend. |

---

## 3. Modifications pour une base URL relative `/api`

### 3.1 `src/lib/api.ts`

- **Navigateur** : utiliser une base relative pour que toutes les requêtes aillent vers la même origine (puis vers le reverse proxy ou le rewrite Next.js).
  - `API_BASE = "/api"` (sans host).
- **Serveur (SSR)** : le serveur Next.js doit joindre le backend directement (réseau Docker ou localhost).
  - `API_BASE = process.env.API_INTERNAL_URL ?? "http://schoolmatrix-api:3000"` (sans préfixe `/api`, le backend est à la racine).
- **Images** : toujours consommées par le navigateur → URL relative `/api/uploads/...`.
  - Dans `getImageUrl`, pour les chemins relatifs, retourner `"/api" + path` (ex. `"/api/uploads/xxx.jpg"`).

Modifications concrètes :

```ts
// Base URL : navigateur = /api (relative), serveur = backend direct (SSR).
const API_BASE =
  typeof window !== "undefined"
    ? "/api"
    : (process.env.API_INTERNAL_URL ?? "http://schoolmatrix-api:3000");

function getImageUrl(storedUrl: string | null | undefined): string | null {
  if (!storedUrl || !storedUrl.trim()) return null;
  const trimmed = storedUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `/api${path}`;
}
```

Aucune variable `NEXT_PUBLIC_*` n’est plus nécessaire pour l’API.

### 3.2 Pages qui redéfinissent `API_BASE`

Supprimer la ligne locale `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"` et s’assurer que `API_BASE` est importé depuis `@/src/lib/api` (avec `fetchWithAuth` et/ou `getImageUrl` selon les besoins).

Fichiers à modifier (supprimer la redéfinition, ajouter `API_BASE` à l’import si absent) :

- `src/app/dashboard/fiche-eleve/page.tsx`
- `src/app/dashboard/school/page.tsx`
- `src/app/dashboard/classes/page.tsx`
- `src/app/dashboard/subjects/page.tsx`
- `src/app/dashboard/moniteur-finance/page.tsx`
- `src/app/dashboard/schedule/page.tsx`
- `src/app/dashboard/grades/page.tsx`
- `src/app/dashboard/comptabilite/page.tsx`
- `src/app/dashboard/depenses/page.tsx`
- `src/app/dashboard/students/page.tsx`
- `src/app/dashboard/academic-years/page.tsx`
- `src/app/dashboard/students/import/page.tsx`
- `src/app/dashboard/teachers/page.tsx`
- `src/app/dashboard/formation-classe/page.tsx`
- `src/app/dashboard/discipline/page.tsx`
- `src/app/dashboard/economat/page.tsx`
- `src/app/dashboard/users/page.tsx`

Exemple : remplacer  
`import { fetchWithAuth } from "@/src/lib/api";`  
et  
`const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";`  
par  
`import { fetchWithAuth, API_BASE } from "@/src/lib/api";`  
(sans redéclaration de `API_BASE`).

---

## 4. Impacts SSR / API_INTERNAL_URL

- **Pas de `getServerSideProps` / `getStaticProps`** dans le projet : les données sont chargées côté client (useEffect, fetch au montage). Donc peu de requêtes réelles côté serveur Next.js.
- **`API_INTERNAL_URL`** reste utile si un jour du rendu serveur appelle l’API (ou pour les rewrites, voir ci‑dessous). Dans `api.ts`, côté `typeof window === "undefined"`, on utilise `API_INTERNAL_URL` pour construire l’URL du backend (sans préfixe `/api`), car le serveur Node parle directement au conteneur `schoolmatrix-api:3000` (routes à la racine : `/classes`, `/auth/login`, etc.).
- **Rewrites Next.js** : pour les environnements **sans** nginx (ex. `docker compose` avec seulement api + web), le navigateur envoie `fetch("/api/classes")` au serveur Next.js (même origine). Il faut que Next.js proxy `/api` vers le backend. On ajoute dans `next.config.ts` une règle `rewrites()` qui envoie `/api/:path*` vers `API_INTERNAL_URL/:path*`. Ainsi une même image frontend fonctionne avec ou sans nginx.

---

## 5. Configuration nginx recommandée

- **`/`** → frontend (conteneur web, ex. port 3001).
- **`/api`** → backend (conteneur API, port 3000), en retirant le préfixe `/api` pour que le backend reçoive `/classes`, `/auth/login`, `/uploads/...`, etc.

Exemple de configuration (fichier à mettre en place, ex. `nginx/nginx.conf` ou dans un image nginx) :

```nginx
server {
  listen 80;
  server_name _;

  # Frontend (Next.js)
  location / {
    proxy_pass http://web:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }

  # Backend (NestJS) : /api/* → backend à la racine
  location /api/ {
    proxy_pass http://api:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
  }
}
```

Le `proxy_pass http://api:3000/;` avec le slash final fait que `/api/classes` est transmis au backend comme `/classes`.

---

## 6. Changements docker-compose pour ajouter nginx

- Ajouter un service **nginx** qui dépend de `api` et `web`, avec un volume ou un build pour la config nginx.
- Exposer un seul port (ex. **80**) sur nginx ; ne plus exposer 3000 et 3001 sur l’hôte en production (ou les garder pour debug).
- Les variables `NEXT_PUBLIC_API_URL` et le build-arg associé sont supprimés pour le service `web`. Garder uniquement `API_INTERNAL_URL` pour le conteneur web (SSR + rewrites).

Un exemple complet est fourni dans le dépôt :

- **`nginx/nginx.conf`** : configuration nginx (routage `/` et `/api/`).
- **`docker-compose.prod-nginx.yml`** : stack complète (db, api, web, nginx) avec images ECR ; seul le port 80 est exposé. Les services `api` et `web` utilisent `expose` au lieu de `ports` pour rester accessibles uniquement depuis nginx.

Pour lancer avec nginx (après `docker compose pull` ou build) :

```bash
docker compose -f docker-compose.prod-nginx.yml up -d
```

L’application est alors accessible sur `http://localhost` (ou l’IP de l’hôte).

---

## 7. Stratégie finale — build universel (local + EC2 + ECR)

1. **Frontend**
   - `api.ts` : base relative `/api` en client, `API_INTERNAL_URL` en serveur ; `getImageUrl` → `/api` + chemin.
   - Toutes les pages utilisent `API_BASE` importé depuis `api.ts` (plus de `NEXT_PUBLIC_API_URL`).
   - `next.config.ts` : ajout de `rewrites()` pour `/api/:path*` → `API_INTERNAL_URL/:path*` (pour les déploiements sans nginx).
   - Dockerfile frontend : **supprimer** l’ARG/ENV `NEXT_PUBLIC_API_URL` (ou les laisser optionnels et ne plus les utiliser).

2. **Backend**
   - Aucun changement : les routes restent à la racine (`/auth`, `/classes`, `/uploads`, etc.). Le strip du préfixe `/api` est géré par nginx (ou par le rewrite Next.js).

3. **Docker / ECR**
   - Build frontend **sans** `NEXT_PUBLIC_API_URL` ; une seule image pour tous les environnements.
   - Compose : retirer `NEXT_PUBLIC_API_URL` du service `web` ; garder `API_INTERNAL_URL` (ex. `http://schoolmatrix-api:3000`).
   - GitHub Actions : ne plus passer `--build-arg NEXT_PUBLIC_API_URL=...` pour `schoolmatrix-web`.

4. **Déploiement**
   - **Avec nginx** (recommandé en prod) : un seul port (80 ou 443), nginx route `/` → web, `/api` → api. Même image partout.
   - **Sans nginx** (dev ou compose minimal) : l’utilisateur accède au frontend (ex. :3001) ; les requêtes `/api` sont gérées par les rewrites Next.js vers le backend. `API_INTERNAL_URL` doit être défini sur le conteneur web.

5. **Résumé**
   - Une seule image frontend, une seule image backend.
   - Plus de rebuild par environnement.
   - Fonctionne en local (avec ou sans nginx) et sur EC2 (avec nginx recommandé).
