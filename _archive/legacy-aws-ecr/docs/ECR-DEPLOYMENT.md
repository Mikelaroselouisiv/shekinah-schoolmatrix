# Intégration AWS ECR — SchoolMatrix

Build des images sur GitHub Actions et mise à jour de la production locale depuis ECR (sans déploiement EC2 pour l’instant).

---

## 1. Workflow GitHub Actions

**Fichier :** `.github/workflows/build-push-ecr.yml`

- **Déclenchement :** push sur `main` ou `master`, ou exécution manuelle (workflow_dispatch).
- **Actions :**
  - Checkout du dépôt
  - Configuration des identifiants AWS (secrets)
  - Login Docker vers ECR
  - **Backend :** build de l’image depuis `./shekinah-schoolmatrix-backend`, tag `latest` + short SHA du commit, push vers `421983920969.dkr.ecr.us-east-2.amazonaws.com/schoolmatrix-api`
  - **Frontend :** build depuis `./shekinah-schoolmatrix-frontend` avec `NEXT_PUBLIC_API_URL=http://127.0.0.1:3000`, tag `latest` + short SHA, push vers `.../schoolmatrix-web`

**Compte et région :** account `421983920969`, région `us-east-2`, repositories ECR : `schoolmatrix-api`, `schoolmatrix-web`.

**Prérequis ECR :** les deux repositories doivent exister dans ECR (création manuelle ou via Terraform/CloudFormation si besoin). Noms exacts : `schoolmatrix-api`, `schoolmatrix-web`.

---

## 2. Secrets GitHub requis

À configurer dans **Settings → Secrets and variables → Actions** du dépôt :

| Secret | Description | Obligatoire |
|--------|-------------|-------------|
| **AWS_ACCESS_KEY_ID** | Clé d’accès d’un utilisateur IAM ayant les droits ECR (GetAuthorizationToken, PutImage, InitiateLayerUpload, etc. sur les repos `schoolmatrix-api` et `schoolmatrix-web`). | Oui |
| **AWS_SECRET_ACCESS_KEY** | Secret associé à la clé ci‑dessus. | Oui |

Aucun autre secret n’est utilisé par le workflow. Pas de déploiement EC2 pour l’instant.

---

## 3. Variables côté production locale (script « Mettre à jour »)

Pour que **`update-prod-local-ecr.js`** et **`docker-compose.prod-local-ecr.yml`** tirent les bonnes images, le **`.env`** à la racine du projet doit contenir (en plus de `SCHOOLMATRIX_DATA` et `DB_*`) :

**Important :** Les identifiants AWS (login ECR) ne doivent **pas** être mis dans le `.env`. Utiliser `aws configure` ou les variables d’environnement `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` avant de lancer le script.

| Variable | Exemple | Rôle |
|----------|---------|------|
| **ECR_REGISTRY** | `421983920969.dkr.ecr.us-east-2.amazonaws.com` | Registry ECR utilisé pour le login et pour les noms d’images dans le compose. |
| **AWS_REGION** | `us-east-2` | Région pour `aws ecr get-login-password --region`. |
| **IMAGE_TAG** | `latest` ou `a1b2c3d` (short SHA) | Tag des images à tirer (défaut : `latest`). |

Exemple complet : voir **`.env.example`**. Les identifiants AWS pour le login en local viennent de **AWS CLI** (`aws configure`) ou des variables d’environnement **AWS_ACCESS_KEY_ID** / **AWS_SECRET_ACCESS_KEY** (éviter de les mettre dans le `.env` en clair).

---

## 4. Commandes exécutées par le script local

Lors de **`node scripts/update-prod-local-ecr.js`** (ou bouton Electron « Mettre à jour »), le script enchaîne :

1. **Préparation**  
   `prepare-prod-local.js` : création/vérification du dossier de données, sous-dossiers, `.env.prod` si besoin.

2. **Login ECR**  
   ```bash
   aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 421983920969.dkr.ecr.us-east-2.amazonaws.com
   ```  
   (région et registry lus depuis `.env` ou variables d’environnement.)

3. **Pull des images**  
   ```bash
   docker compose -f docker-compose.prod-local-ecr.yml pull
   ```

4. **Démarrage de la stack**  
   ```bash
   docker compose -f docker-compose.prod-local-ecr.yml up -d
   ```

Le script **`scripts/login-ecr.js`** est utilisé pour l’étape 2 (appelé par `update-prod-local-ecr.js`). Il peut aussi être lancé seul : `node scripts/login-ecr.js`.

---

## 5. Flux complet (GitHub → ECR → local)

1. **Développeur** pousse du code sur `main` (ou `master`).
2. **GitHub Actions** se déclenche (workflow `Build and push to ECR`) :
   - build des images backend et frontend,
   - tag `latest` + tag court du commit (ex. `a1b2c3d`),
   - push vers ECR :  
     `421983920969.dkr.ecr.us-east-2.amazonaws.com/schoolmatrix-api:latest` (et `:a1b2c3d`),  
     `421983920969.dkr.ecr.us-east-2.amazonaws.com/schoolmatrix-web:latest` (et `:a1b2c3d`).
3. **Sur la machine de prod locale** (ou via l’app Electron), l’utilisateur clique sur **« Mettre à jour »** (ou lance `node scripts/update-prod-local-ecr.js`).
4. Le script :
   - prépare l’environnement local si besoin,
   - fait le **login ECR** (avec AWS CLI ou variables AWS),
   - exécute **docker compose -f docker-compose.prod-local-ecr.yml pull** puis **up -d**,
   - les conteneurs api et web utilisent les nouvelles images ECR (par défaut `latest` ; ou le tag configuré dans `.env`).

Résultat : la production locale tourne avec les images construites et poussées par GitHub vers ECR, sans build local et sans déploiement EC2.
