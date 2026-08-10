# Résumé technique — Architecture SchoolMatrix et déploiement EC2

## Vue d’ensemble fonctionnelle

**SchoolMatrix** est une application de gestion scolaire (établissement) comprenant :

- **Backend (API)** : gestion des utilisateurs, élèves, classes, professeurs, années scolaires, notes (dont préscolaire), emplois du temps, discipline, économat (frais de scolarité, paiements), comptabilité, dépenses, activités extrascolaires, profil d’école, synchronisation, stockage de fichiers (uploads, profils, sauvegardes) et option S3.
- **Frontend (web)** : interface Next.js (dashboard) pour tout ce qui précède : login, fiches élèves, classes, formation-classe, matières, notes, discipline, planning, économat, comptabilité, dépenses, moniteur finance, paramètres école, utilisateurs, export PDF.
- **Application desktop (Electron)** : lanceur Windows qui prépare un dossier de données, copie les scripts et compose, et démarre la stack Docker (build local ou images ECR) pour une « production locale ».

**Communication entre services** : le navigateur appelle l’API via `NEXT_PUBLIC_API_URL` (ex. `http://localhost:3000`). Le rendu serveur Next.js (SSR) utilise `API_INTERNAL_URL` pour joindre l’API depuis le conteneur web (ex. `http://schoolmatrix-api:3000`). L’API lit/écrit PostgreSQL et sert les fichiers statiques sous `/uploads/`.

---

## 1. Architecture générale du projet

### Technologies utilisées

| Couche        | Technologie |
|---------------|-------------|
| Backend       | Node.js 20, NestJS 11, TypeORM, PostgreSQL (pg), JWT (Passport), bcrypt |
| Frontend      | Node.js 20, Next.js 16, React 19, Tailwind CSS 4, TypeScript |
| Base de données | PostgreSQL 16 (Alpine) |
| Desktop       | Electron (Windows), lance Docker et ouvre le frontend |
| CI/CD         | GitHub Actions (build + push ECR) |

### Backend

- **Framework** : NestJS 11
- **Port** : `3000` (configurable via `PORT`)
- **Dépendances principales** : `@nestjs/core`, `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/jwt`, `passport-jwt`, `bcrypt`, `@aws-sdk/client-s3` (optionnel)
- **Démarrage production** : `node scripts/bootstrap-production.js` (attente DB, migrations TypeORM, puis `node dist/main.js`)
- **Racine stockage** : `STORAGE_ROOT` (défaut `/app/storage` en Docker), sous-dossiers `uploads/`, `profiles/`, `backups/`

### Frontend

- **Framework** : Next.js 16 (React 19)
- **Port** : `3001` (configurable via `PORT`)
- **Build** : `next build` avec **output: "standalone"** (`next.config.ts`) pour le déploiement Docker
- **Démarrage** : `node server.js` (fichier standalone généré par le build)
- **Variables au build** : `NEXT_PUBLIC_API_URL` (URL de l’API côté navigateur) ; en runtime : `API_INTERNAL_URL` pour le SSR

### Base de données

- **Moteur** : PostgreSQL 16 (image `postgres:16-alpine`)
- **Port interne** : 5432 (non exposé en prod locale ; exposé uniquement si besoin en dev)
- **Config** : `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` (lues par le backend)

---

## 2. Docker

### Fichiers Dockerfile

| Fichier | Rôle |
|---------|------|
| `shekinah-schoolmatrix-backend/Dockerfile` | Build multi-stage : Node 20 Alpine → build NestJS → runner avec `node scripts/bootstrap-production.js`, EXPOSE 3000 |
| `shekinah-schoolmatrix-frontend/Dockerfile` | Build multi-stage : Node 20 Alpine, `NEXT_PUBLIC_API_URL` en ARG → build Next.js standalone → runner avec `node server.js`, EXPOSE 3001 |

Les deux utilisent un ARG `CACHEBUST` pour invalider le cache (ex. `--build-arg CACHEBUST=$(date +%s)`).

### Fichiers docker-compose

| Fichier | Usage |
|---------|--------|
| `docker-compose.yml` (racine) | Dev : API + Web, DB sur l’hôte (`host.docker.internal:5433`), build local |
| `docker-compose.prod-local.yml` | Prod locale Windows : **build local** des images `schoolmatrix-api` et `schoolmatrix-web` + service `db` (PostgreSQL) |
| `docker-compose.prod-local-ecr.yml` | Prod locale ou EC2 : **images ECR** (pas de build), même stack db + api + web |

En EC2, le script `install-schoolmatrix-ec2.sh` copie `docker-compose.prod-local-ecr.yml` vers `$INSTALL_DIR/docker-compose.yml`.

### Ports exposés

| Service | Port hôte → conteneur | Remarque |
|---------|------------------------|----------|
| API     | 3000 → 3000           | Partout (dev, prod-local, ECR) |
| Web     | 3001 → 3001           | Idem |

PostgreSQL n’expose pas de port vers l’hôte dans les compose de prod (accès uniquement depuis les conteneurs).

### Variables d’environnement

**Fichier `.env` (racine ou dossier d’installation, pour docker-compose)** :

- `SCHOOLMATRIX_DATA` : chemin du dossier de données (obligatoire pour prod-local / EC2)
- `DB_USER`, `DB_PASS`, `DB_NAME` : PostgreSQL (lues par le service `db`)
- `ECR_REGISTRY`, `AWS_REGION`, `IMAGE_TAG` : pour compose ECR (pull des images)
- Optionnel : `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_PREFIX`

**Fichier `.env.prod` (dans `$SCHOOLMATRIX_DATA` ou `$INSTALL_DIR`, chargé par le service `api` via `env_file`)** :

- `DB_HOST=db`, `DB_PORT=5432`, `DB_USER`, `DB_PASS`, `DB_NAME`
- `JWT_SECRET` (obligatoire en production)
- Optionnel : `STORAGE_ROOT`, `NODE_ID`, `AWS_*` (S3)

Les templates sont dans `scripts/env.template` et `scripts/env.prod.local.template`.

### Volumes

| Volume | Montage | Rôle |
|--------|---------|------|
| `${SCHOOLMATRIX_DATA}/postgres_data` | `/var/lib/postgresql/data` | Données PostgreSQL |
| `${SCHOOLMATRIX_DATA}/storage` | `/app/storage` (API) | Fichiers (uploads, profils, backups) |

---

## 3. Images Docker

### Noms et tags

| Service | Nom d’image (build local) | Nom ECR | Tags |
|---------|---------------------------|---------|------|
| Backend | `schoolmatrix-api` | `421983920969.dkr.ecr.us-east-2.amazonaws.com/schoolmatrix-api` | `latest`, `SHORT_SHA` (ex. `abc1234`) |
| Frontend | `schoolmatrix-web` | `421983920969.dkr.ecr.us-east-2.amazonaws.com/schoolmatrix-web` | `latest`, `SHORT_SHA` |

### Configuration pour AWS ECR

- **Région** : `us-east-2`
- **Registry** : `421983920969.dkr.ecr.us-east-2.amazonaws.com`
- **Repos** : `schoolmatrix-api`, `schoolmatrix-web`
- **Authentification** : `aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <ECR_REGISTRY>`
- Le workflow GitHub Actions (`.github/workflows/build-push-ecr.yml`) build et push les deux images sur push `main`/`master` (tags : SHA court + `latest`). Le frontend est buildé avec `NEXT_PUBLIC_API_URL=http://127.0.0.1:3000` (adapté à un accès local / derrière reverse proxy même origine).

---

## 4. Processus de déploiement actuel

### Comment le système tourne en local

1. **Dev** : base PostgreSQL à part (ex. `shekinah-db-dev` sur 5433). À la racine : `docker compose up -d --build` ou `.\run.ps1` → API + Web qui pointent vers `host.docker.internal:5433`.
2. **Prod locale (build local)** :  
   - Préparation : `node scripts/prepare-prod-local.js` (ou via Electron) → crée `SCHOOLMATRIX_DATA`, sous-dossiers, `.env`, `.env.prod`.  
   - Lancement : `node scripts/start-prod-local-build.js` → `docker compose -f docker-compose.prod-local.yml up -d --build`.
3. **Prod locale (images ECR)** :  
   - Préparation idem.  
   - Mise à jour : `node scripts/update-prod-local-ecr.js` → login ECR, `docker compose -f docker-compose.prod-local-ecr.yml pull` puis `up -d`.

### Commandes pour lancer les conteneurs

- Build + démarrage (prod locale, build local) :  
  `docker compose -f docker-compose.prod-local.yml up -d --build`
- Démarrage avec images ECR :  
  `docker compose -f docker-compose.prod-local-ecr.yml pull` puis  
  `docker compose -f docker-compose.prod-local-ecr.yml up -d`
- Variables : `.env` à la racine avec `SCHOOLMATRIX_DATA` (et pour ECR : `ECR_REGISTRY`, `IMAGE_TAG`, `AWS_REGION`). Le service `api` lit `env_file: ${SCHOOLMATRIX_DATA}/.env.prod`.

### Build et push vers ECR

- **Automatique** : push sur `main`/`master` déclenche le workflow qui build les deux images et les pousse vers ECR (tags SHA + `latest`).
- **Manuel** : même principe que le workflow :  
  - Login ECR (voir `scripts/login-ecr.js`).  
  - Backend : `docker build -t <ECR_REGISTRY>/schoolmatrix-api:latest ./shekinah-schoolmatrix-backend` puis `docker push ...`.  
  - Frontend : `docker build -t <ECR_REGISTRY>/schoolmatrix-web:latest --build-arg NEXT_PUBLIC_API_URL=... ./shekinah-schoolmatrix-frontend` puis `docker push ...`.

### Pull et lancement (côté client / EC2)

- **Login** : `aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <ECR_REGISTRY>` (ou `node scripts/login-ecr.js` si .env présent).
- **Pull** : depuis le dossier où se trouve le compose et le `.env` :  
  `docker compose -f docker-compose.prod-local-ecr.yml pull` (ou sur EC2 : `docker compose pull` si le compose a été copié en `docker-compose.yml`).
- **Up** : `docker compose -f docker-compose.prod-local-ecr.yml up -d` (ou sur EC2 : `docker compose up -d`).

---

## 5. Infrastructure prévue pour production

### Ports utilisés

- **API** : 3000 (interne et exposé ; en production publique on peut ne l’exposer que via reverse proxy).
- **Frontend** : 3001 (interne et exposé).
- **PostgreSQL** : 5432 (réseau Docker uniquement, pas d’exposition publique recommandée).

### Dépendances entre services

- **db** → aucun (PostgreSQL démarre en premier).
- **api** → dépend de `db` (healthcheck). Lit `DB_HOST=db`, `DB_PORT=5432`, montage `storage`.
- **web** → dépend de `api` (pour le SSR via `API_INTERNAL_URL=http://schoolmatrix-api:3000`). Le navigateur appelle `NEXT_PUBLIC_API_URL` (doit pointer vers l’URL publique de l’API si domaine différent).

### Reverse proxy (nginx) recommandé pour la production

- **Problème** : l’image web est buildée avec `NEXT_PUBLIC_API_URL=http://127.0.0.1:3000`. En accès direct à l’EC2 (ex. `http://IP:3001`), le navigateur tente d’appeler `http://127.0.0.1:3000` (machine de l’utilisateur), ce qui échoue.
- **Solutions** :  
  1. **Avec nginx** : un seul domaine (ex. `https://schoolmatrix.example.com`). Nginx : `/` → 3001 (web), `/api` ou sous-domaine → 3000 (API). Rebuild du frontend avec `NEXT_PUBLIC_API_URL` = URL publique de l’API (ex. `https://schoolmatrix.example.com` ou `https://api.schoolmatrix.example.com`).  
  2. **Sans nginx** : exposer 3000 et 3001 et rebuild le frontend avec `NEXT_PUBLIC_API_URL=http://<IP_EC2>:3000` (ou le domaine public de l’API). Moins propre (deux ports, pas de HTTPS centralisé).

Pour une prod propre sur EC2 : installer nginx (ou Caddy), configurer HTTPS (certificat), et faire un rebuild du frontend avec la bonne `NEXT_PUBLIC_API_URL` avant de pousser l’image ECR.

---

## 6. Configuration actuelle du serveur (EC2)

### Ce qui doit exister sur l’EC2

- **Docker** et **Docker Compose** (v2) installés.
- **AWS CLI** configuré (ou variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) pour `docker pull` depuis ECR.
- **Dossier d’installation** (ex. `/home/ubuntu/schoolmatrix-prod`) avec :
  - `.env` : `SCHOOLMATRIX_DATA`, `DB_*`, `ECR_REGISTRY`, `AWS_REGION`, `IMAGE_TAG` ; optionnel `AWS_*` pour S3.
  - `.env.prod` : `DB_HOST=db`, `DB_PORT=5432`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET` ; optionnel `AWS_*`.
  - `docker-compose.yml` (copie de `docker-compose.prod-local-ecr.yml`).
  - Sous-dossiers : `storage/uploads`, `storage/profiles`, `storage/backups`, `postgres_data` (créés par le script d’install).

### Script d’installation

- `scripts/install-schoolmatrix-ec2.sh` : idempotent, crée `INSTALL_DIR` (défaut `/home/ubuntu/schoolmatrix-prod`), sous-dossiers, `.env` et `.env.prod` depuis les templates (sans écraser), copie le compose en `docker-compose.yml`.
- À exécuter depuis la racine du repo cloné sur l’EC2 :  
  `chmod +x scripts/install-schoolmatrix-ec2.sh` puis `./scripts/install-schoolmatrix-ec2.sh`.

### Variables d’environnement nécessaires

- **.env (compose)** : `SCHOOLMATRIX_DATA`, `DB_USER`, `DB_PASS`, `DB_NAME`, `ECR_REGISTRY`, `IMAGE_TAG` (ex. `latest`), `AWS_REGION`.
- **.env.prod (API)** : `DB_HOST=db`, `DB_PORT=5432`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET` (obligatoire).
- Pour ECR : identifiants AWS (IAM avec droits ECR pull) sur l’instance (profil IAM ou `aws configure` / variables d’environnement).

---

## 7. Checklist de déploiement EC2

1. **Créer l’instance EC2** (Amazon Linux 2 ou Ubuntu), groupe de sécurité : autoriser au minimum les ports 22 (SSH), 80 (HTTP), 443 (HTTPS) ; si pas de reverse proxy, 3000 et 3001.
2. **Installer Docker et Docker Compose** sur l’instance.
3. **Configurer l’accès à ECR** : rôle IAM avec politique ECR pull, ou `aws configure` / variables d’environnement.
4. **Cloner le dépôt** (ou copier les fichiers nécessaires) sur l’EC2.
5. **Exécuter** `./scripts/install-schoolmatrix-ec2.sh` depuis la racine du repo (éventuellement avec `INSTALL_DIR=/chemin/souhaité`).
6. **Éditer** `$INSTALL_DIR/.env` : `SCHOOLMATRIX_DATA=$INSTALL_DIR`, `ECR_REGISTRY`, `IMAGE_TAG`, `DB_*`, `AWS_REGION`.
7. **Éditer** `$INSTALL_DIR/.env.prod` : `JWT_SECRET` (fort, unique), confirmer `DB_HOST=db`, `DB_PORT=5432`, `DB_USER`, `DB_PASS`, `DB_NAME`.
8. **Se placer dans le dossier d’installation** : `cd $INSTALL_DIR`.
9. **Login ECR** : `aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <ECR_REGISTRY>`.
10. **Pull et démarrage** : `docker compose pull && docker compose up -d`.
11. **Vérifier** : `docker compose ps` ; appels à `http://<IP_EC2>:3001` (web) et `http://<IP_EC2>:3000` (API). Si le navigateur appelle encore `127.0.0.1:3000`, prévoir un reverse proxy et/ou une image frontend rebuildée avec la bonne `NEXT_PUBLIC_API_URL`.
12. **(Recommandé)** Mettre en place un reverse proxy (nginx/Caddy) et HTTPS, puis rebuilder le frontend avec `NEXT_PUBLIC_API_URL` pointant vers l’URL publique de l’API.

---

*Document généré à partir de l’analyse du dépôt Parallele-Schoolmatrix.*
