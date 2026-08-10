# Commandes pour vérifier et faire fonctionner le pipeline ECR

Si le workflow GitHub Actions n’a pas poussé les images sur ECR (dernières du 7 mars, aujourd’hui 11 mars), suivez ces étapes.

---

## 1. Vérifier le workflow sur GitHub

1. Ouvrez : **https://github.com/Mikelaroselouisiv/shekinah-schoolmatrix/actions**
2. Cliquez sur le workflow **« Build and push to ECR »** (dernière exécution).
3. Regardez quelle **étape a échoué** (rouge) :
   - **Configure AWS credentials** → les secrets du dépôt ne sont pas bons ou absents (étape 2 ci‑dessous).
   - **Build and push backend** ou **frontend** → erreur de build Docker (vous pouvez reproduire en local avec les commandes de l’étape 3).
   - **Login to Amazon ECR** → même cause que « Configure AWS credentials » le plus souvent.

---

## 2. Vérifier les secrets GitHub (obligatoire pour le pipeline)

Le workflow a besoin de deux secrets dans le dépôt :

1. **https://github.com/Mikelaroselouisiv/shekinah-schoolmatrix** → **Settings** → **Secrets and variables** → **Actions**.
2. Vérifiez que ces deux secrets existent (la valeur ne se voit pas, seulement le nom) :
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
3. S’ils manquent : **New repository secret** et créez‑les avec les identifiants d’un utilisateur IAM qui a les droits **ECR** (PushImage, GetAuthorizationToken, etc.).

Après avoir ajouté ou corrigé les secrets, relancez le workflow :
- Onglet **Actions** → **Build and push to ECR** → **Run workflow** (bouton à droite) → **Run workflow**.

---

## 3. Build et push manuels depuis votre PC (Windows)

Si vous voulez pousser les images tout de suite sans attendre le workflow, exécutez ces commandes dans **PowerShell** depuis la racine du dépôt (`Parallele-Schoolmatrix`).

**Prérequis :** Docker Desktop lancé, AWS CLI installé et configuré (`aws configure` avec les mêmes identifiants que pour ECR).

### 3.1 Variables (à adapter si besoin)

```powershell
cd "c:\Users\User\Documents\Parallele-Schoolmatrix"
$ECR_REGISTRY = "421983920969.dkr.ecr.us-east-2.amazonaws.com"
$AWS_REGION   = "us-east-2"
$IMAGE_TAG    = git rev-parse --short HEAD
```

Si `git rev-parse --short HEAD` ne renvoie rien dans PowerShell, utilisez à la place :

```powershell
$IMAGE_TAG = (git rev-parse --short HEAD).Trim()
```

### 3.2 Login ECR

```powershell
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
```

### 3.3 Build et push backend (schoolmatrix-api)

```powershell
docker build -t "${ECR_REGISTRY}/schoolmatrix-api:latest" -t "${ECR_REGISTRY}/schoolmatrix-api:${IMAGE_TAG}" ./shekinah-schoolmatrix-backend
docker push "${ECR_REGISTRY}/schoolmatrix-api:latest"
docker push "${ECR_REGISTRY}/schoolmatrix-api:${IMAGE_TAG}"
```

### 3.4 Build et push frontend (schoolmatrix-web)

```powershell
docker build -t "${ECR_REGISTRY}/schoolmatrix-web:latest" -t "${ECR_REGISTRY}/schoolmatrix-web:${IMAGE_TAG}" --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:3000 ./shekinah-schoolmatrix-frontend
docker push "${ECR_REGISTRY}/schoolmatrix-web:latest"
docker push "${ECR_REGISTRY}/schoolmatrix-web:${IMAGE_TAG}"
```

---

## 4. Tout en une fois (copier‑coller)

À exécuter dans **PowerShell**, depuis la racine du dépôt :

```powershell
cd "c:\Users\User\Documents\Parallele-Schoolmatrix"
$ECR_REGISTRY = "421983920969.dkr.ecr.us-east-2.amazonaws.com"
$AWS_REGION   = "us-east-2"
$IMAGE_TAG    = (git rev-parse --short HEAD).Trim()

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
if ($LASTEXITCODE -ne 0) { exit 1 }

docker build -t "${ECR_REGISTRY}/schoolmatrix-api:latest" -t "${ECR_REGISTRY}/schoolmatrix-api:${IMAGE_TAG}" ./shekinah-schoolmatrix-backend
if ($LASTEXITCODE -ne 0) { exit 1 }
docker push "${ECR_REGISTRY}/schoolmatrix-api:latest"
docker push "${ECR_REGISTRY}/schoolmatrix-api:${IMAGE_TAG}"

docker build -t "${ECR_REGISTRY}/schoolmatrix-web:latest" -t "${ECR_REGISTRY}/schoolmatrix-web:${IMAGE_TAG}" --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:3000 ./shekinah-schoolmatrix-frontend
if ($LASTEXITCODE -ne 0) { exit 1 }
docker push "${ECR_REGISTRY}/schoolmatrix-web:latest"
docker push "${ECR_REGISTRY}/schoolmatrix-web:${IMAGE_TAG}"

Write-Host "Terminé. Images : ${ECR_REGISTRY}/schoolmatrix-api:${IMAGE_TAG} et schoolmatrix-web:${IMAGE_TAG}"
```

En cas d’erreur, la commande qui a échoué s’affichera (build backend, build frontend ou push). Corriger cette étape puis relancer à partir d’elle.

---

## 5. Vérifier que les images sont sur ECR

```powershell
aws ecr describe-images --repository-name schoolmatrix-api --region us-east-2 --query "imageDetails[*].[imageTags[0],imagePushedAt]" --output table
aws ecr describe-images --repository-name schoolmatrix-web --region us-east-2 --query "imageDetails[*].[imageTags[0],imagePushedAt]" --output table
```

Vous devez voir des lignes avec la date du jour (11 mars) si le push a réussi.
