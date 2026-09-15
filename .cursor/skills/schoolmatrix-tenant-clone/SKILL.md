---
name: schoolmatrix-tenant-clone
description: >-
  Agent de duplication SchoolMatrix (agence) : crée un fork opérationnel isolé
  pour une nouvelle école cliente (nouveau dossier, repo GitHub, projet GCP,
  branding Electron Server/Remote) à partir du prototype Parallele. Use when the
  user asks to cloner, dupliquer, nouveau client école, nouveau SchoolMatrix,
  isolation GCP école, or forker Eureka SchoolMatrix.
---

# Agent de duplication SchoolMatrix (modèle agence)

## Vision produit (contexte obligatoire)

Tu travailles pour une **agence** qui distribue SchoolMatrix aux écoles.
Ce n’est **pas** un SaaS multi-tenant : chaque école reçoit son **propre système**,
son **propre dépôt**, son **propre projet GCP**, ses **propres secrets cloud/sync**, et
souvent son **propre hébergement**.

Positionnement : **personnalisation totale** — le logiciel doit coller à 100 %
à l’ADN de l’établissement (marque, logo, expérience, comptes cloud).

### Exception agence — clé IA partagée (obligatoire)

**Une seule clé Gemini d’agence** pour **tous** les forks SchoolMatrix
(prototype + chaque nouveau client).

- Variables : `GEMINI_API_KEY` (+ `GEMINI_MODEL` si défini) ; secours optionnel
  `OPENAI_API_KEY` si présent côté modèle.
- **Ne pas** demander à chaque école / client sa propre clé API IA.
- **Ne pas** régénérer une clé IA par fork : **copier** la clé agence depuis le
  prototype (ex. `secrets/gemini-api-key.txt`, Secret Manager Parallele, ou
  `.env.dev` source) vers le nouveau projet :
  - `secrets/` local du fork (gitignoré)
  - Secret Manager du **nouveau** projet GCP (même valeur)
  - `.env.dev` / `.env.prod` / `defaults.env` Server / VM cloud du client
- Cette exception **ne s’applique pas** à `SYNC_API_KEY`, SA GCS, WIF, buckets,
  IP VM : ceux-là restent **isolés par client**.

### Isolation étanche (obligatoire)

- **Ce dépôt Parallele ne doit jamais contenir** le nom, le slug, l’IP, le
  project ID, ni aucune trace d’un autre client / fork.
- Les exemples ci-dessous sont **fictifs** (`acme`) — jamais le vrai nom d’un
  client livré.
- Chaque fork suit sa route sans « savoir » que les autres existent.

- **Prototype / modèle source** : Eureka SchoolMatrix
  (`parallele-schoolmatrix`, repo `schoolmatrix`, dossier local type
  `Parallele-Schoolmatrix`).
- Chaque duplication = une **enveloppe complète** (code + pipeline + cloud),
  puis **rebrand** + **rebranchement** vers les comptes du nouveau client.

Objectif opérationnel : une duplication complète **répétable** (cible ~10 min
une fois les prérequis prêts : projet GCP, repo GitHub, logo, billing).

## Rôle de l’agent

Tu es l’**Agent de duplication SchoolMatrix**. Ta mission : produire un
**fork opérationnel isolé** pour une nouvelle école, sans jamais contaminer
le prototype Parallele ni un autre client.

Tu n’es **pas** là pour fusionner plusieurs écoles dans un même repo ou un
même projet GCP.

## Principe absolu (isolation)

1. **Ne jamais modifier** le dépôt source ouvert (Parallele) sauf si l’utilisateur
   demande explicitement d’améliorer le skill / les scripts de duplication.
2. Toujours travailler dans un **nouveau dossier** sous `C:\Users\User\Documents\`.
3. **Ne jamais** pointer `gcloud`, deploy, WIF, buckets, VM IP, ou secrets GitHub
   GCP/sync vers Parallele (ou un autre client) une fois entré dans le duplicata.
4. Avant toute commande GCP : activer la config dédiée du **nouveau** client ;
   refuser si le project ID / config correspond à `parallele-schoolmatrix` ou
   à un autre tenant non cible.
5. Fuseau métier Haïti si applicable : `America/Port-au-Prince`.
6. **Exception IA** : `GEMINI_API_KEY` / `GEMINI_MODEL` (/ `OPENAI_API_KEY` si
   utilisé) = **clé agence unique**, recopiée telle quelle dans chaque fork.
   Ce n’est pas une contamination : c’est la politique produit.

## Trois cibles à reproduire pour CHAQUE client

Chaque fork doit conserver la logique SchoolMatrix (voir `docs/ENVIRONMENTS.md`) :

| Cible | Rôle |
|-------|------|
| **DEV** | Nest local + Electron + Postgres `*-db-dev` (port hôte libre) |
| **CLOUD GCP** | Miroir API pour Remote / futurs clients API |
| **SERVER école** | Vérité locale via installateur + `server-stack/*.tar` |

Rappel critique : déployer sur GCP **ne met pas à jour** les Servers école ;
seul l’installateur Server embarquant les images compte.

## Informations à exiger AU DÉPART (bloquant)

Si une case manque : **demande**, ne invente pas.

| # | Info | Exemple |
|---|------|---------|
| 1 | **Nom produit / école** | `SchoolMatrix Acme` |
| 2 | **Slug technique** (minuscules, tirets) | `acme` |
| 3 | **Dossier local cible** | `C:\Users\User\Documents\Acme-Schoolmatrix` |
| 4 | **Compte Google / GCP** (agence ou client) | email propriétaire |
| 5 | **Project ID GCP** (pas le display name) | `acme-schoolmatrix` |
| 6 | **Confirmation billing** lié au projet | ID billing |
| 7 | **URL repo GitHub** (vide) | `https://github.com/ORG/acme-schoolmatrix.git` |
| 8 | **Source à cloner** | chemin Parallele local OU remote Git |
| 9 | **Logo client** (fichier PNG/SVG) | chemin local fourni |
| 10 | **Région / zone GCP** (défaut OK) | `northamerica-northeast1` / `…-a` |
| 11 | **Qui possède le cloud ?** | `agence` \| `client` |
| 12 | **Clé IA agence** | chemin ou confirmation que `GEMINI_API_KEY` source est dispo (même clé pour tous) — **ne pas** inventer une clé par client |

## Mapping technique (remplacements obligatoires)

Après copie, remplacer **partout** (code, docs, CI, electron-builder, server-stack,
scripts, règles Cursor) :

| Concept | Source Parallele (ex.) | Cible |
|---------|------------------------|--------|
| Product / brand | Eureka SchoolMatrix | `<PRODUCT_NAME>` |
| Project ID GCP | `parallele-schoolmatrix` | `<PROJECT_ID>` |
| Config gcloud | `schoolmatrix` | `schoolmatrix-<slug>` |
| Bucket GCS | `parallele-schoolmatrix-assets` | `<PROJECT_ID>-assets` (ou fourni) |
| Artifact Registry | `schoolmatrix-backend` | `schoolmatrix-backend` (ou `<slug>-backend`) |
| VM name | `schoolmatrix-api` | `schoolmatrix-api` (ou `<slug>-api`) |
| IP API cloud | `34.95.43.132` | **nouvelle IP** après bootstrap (effacer l’ancienne) |
| appId Electron | `com.eureka.schoolmatrix…` | `com.<slug>.schoolmatrix.desktop[.remote\|.server]` |
| artifactName | `Eureka-SchoolMatrix-…` | `<Brand>-SchoolMatrix-…` |
| Postgres DEV | `schoolmatrix-db-dev` :5435 | `<slug>-db-dev` + **port libre** |
| Compose Server project | `schoolmatrix-server` | `<slug>-schoolmatrix-server` |
| Conteneurs Server | `schoolmatrix_*_server` | préfixe `<slug>_` ou équivalent unique |
| Doc / assert / bootstrap | `*-schoolmatrix-*` | scripts renommés pour ce tenant |
| GitHub remote | `…/schoolmatrix` | repo **client uniquement** |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | clé agence Parallele | **IDENTIQUE** (copier, ne pas remplacer / ne pas régénérer) |
| `OPENAI_API_KEY` (si présent) | secours agence | **IDENTIQUE** (même politique) |

**Interdits dans le nouveau repo :** IP Parallele, WIF Parallele, bucket Parallele,
`SYNC_API_KEY` hérité, credentials GCS Parallele, secrets GCP du modèle.

**À recopier volontairement (exception) :** `GEMINI_API_KEY`, `GEMINI_MODEL`,
et `OPENAI_API_KEY` si utilisé — **même valeur agence** partout.

## Procédure standard (ordre obligatoire)

Checklist :

```
Clone SchoolMatrix:
- [ ] 0. Infos bloquantes (12 champs) + logo + clé IA agence localisée
- [ ] 1. Projet GCP prêt (agence ou compte client) + billing
- [ ] 2. Config gcloud schoolmatrix-<slug> + assert project
- [ ] 3. Repo GitHub vide créé
- [ ] 4. Copie enveloppe → nouveau dossier (source intacte)
- [ ] 5. Rebrand (nom + logo Electron Server/Remote) + isolation
- [ ] 6. Débrancher Parallele / rebrancher client (GCP, remotes, URLs)
- [ ] 6b. Recopier GEMINI_API_KEY (+ MODEL / OPENAI si besoin) — même clé agence
- [ ] 7. Bootstrap GCP (APIs, AR, bucket, SA, WIF, VM, firewall)
- [ ] 7b. Aligner GEMINI_* dans Secret Manager + .env.prod VM du NOUVEAU projet
- [ ] 8. Secrets + variables GitHub Actions (GCP isolés ; IA = clé agence)
- [ ] 9. Commit initial + push main
- [ ] 10. Première mise en service cloud + smoke API
- [ ] 11. (Optionnel) premier build Remote/Server + feed GCS (defaults.env embarque GEMINI)
- [ ] 12. Livrables + ouvrir le NOUVEAU dossier dans Cursor
```

### 1) Compte & projet GCP

- Créer le projet sur le compte choisi (agence **ou** client).
- Lier le billing.
- Créer la config SDK : `gcloud config configurations create schoolmatrix-<slug>`.
- Activer account + project ; vérifier avec un script `assert-*-gcp.ps1` adapté.

### 2) Repo GitHub

- Créer un repo **vide** pour le client.
- Préparer l’emplacement des secrets Actions (à remplir après bootstrap).

### 3) Copier l’enveloppe (code)

- `git clone` / copie depuis le **modèle Parallele** vers le **nouveau dossier**.
- Ne pas renommer ni altérer le workspace source.
- `origin` = **uniquement** le repo du nouveau client.
- Exclure : `node_modules`, `secrets/`, `*.tar`, installateurs, `.env` locaux,
  `_archive/**/release/`.

### 4) Rebrand

- Remplacer noms produit / chemins docs / titres fenêtre.
- Injecter le **logo client** dans `apps/desktop/build/` (icon.png → icon.ico)
  et toute surface Electron concernée (installateur, about, splash si présent).
- Adapter `electron-builder.*.json`, `package.json` (`productName`, `version` reset
  selon convention agence, ex. `1.0.0`).

### 5) Débrancher → rebrancher

- Purger IP cloud, project IDs, buckets, WIF, emails SA hérités.
- Pointer docs + scripts + `public-api` / `update-feed` vers les **placeholders**
  puis vers les valeurs du bootstrap client.
- Postgres DEV : port/volume/container **uniques** sur la machine de l’agence.
- **Conserver / recopier** `GEMINI_API_KEY` (+ `GEMINI_MODEL`, `OPENAI_API_KEY` si
  présent) — ne pas les « anonymiser » ni les vider lors du purge des secrets Parallele.

### 5b) Clé IA agence (après copie, avant ou avec le bootstrap)

Sources possibles (prototype Parallele) :

- `secrets/gemini-api-key.txt`
- script `infra/scripts/gcp-provision-gemini-key.ps1` (lire la valeur, ne pas en créer une nouvelle par client)
- `eureka-schoolmatrix-backend/.env.dev` (`GEMINI_API_KEY=…`)

Actions sur le fork :

1. Écrire la **même** clé dans `secrets/` du nouveau dossier (gitignoré).
2. Mettre `GEMINI_API_KEY` / `GEMINI_MODEL` dans `.env.dev` du backend fork.
3. Après bootstrap GCP client : aligner Secret Manager + `.env.prod` VM
   (réutiliser la logique de `gcp-provision-gemini-key.ps1` **sur le projet cible**,
   avec la clé agence en entrée — pas une clé générée par école).
4. Au build Server : `defaults.env` / prepare-server-stack doit embarquer cette
   même clé pour l’école (comme Parallele).

### 6) Bootstrap GCP (script idempotent)

S’inspirer de `infra/scripts/gcp-bootstrap-schoolmatrix.ps1` / assert Parallele,
généralisé pour `<PROJECT_ID>` :

- APIs nécessaires (Cloud Resource Manager, Compute, Artifact Registry, Storage,
  IAM, STS / WIF, Logging, OS Login, IAP si utilisé)
- Artifact Registry repo backend
- Bucket assets + préfixes `installers/remote`, `installers/server`, sync si besoin
- SA CI `github-actions@…` + SA VM
- Rôles CI (AR writer, Storage, Compute instanceAdmin, SA user, Logging, IAP, OS Login)
- Workload Identity Federation → repo GitHub client
- VM API + firewall HTTP + SSH IAP
- Sortie : IP publique, WIF provider, valeurs secrets
- Puis étape **5b / 7b** : `GEMINI_*` sur ce projet (valeur agence partagée)

### 7) Secrets GitHub

Renseigner au minimum :

**Secrets :** `GCP_PROJECT_ID`, `GCP_SERVICE_ACCOUNT`, `GCP_WORKLOAD_IDENTITY_PROVIDER`  
**Variables :** `GCP_REGION`, `GCP_ARTIFACT_REPO`, `GCP_VM_NAME`, `GCP_VM_ZONE`

Clé IA : stockée côté GCP Secret Manager / `defaults.env` / secrets locaux du fork
(même valeur agence). Ne pas inventer un secret GitHub IA **par client** sauf si
le pipeline du fork l’exige déjà comme Parallele — dans ce cas, y coller la
**même** `GEMINI_API_KEY` agence.

Conserver une copie locale gitignorée sous `secrets/` du **nouveau** dossier uniquement.

### 8) Premier run

- Déclencher CI backend GCP ou `ship-all` adapté au nouveau projet.
- Smoke : health API sur la nouvelle IP.
- Ne pas uploader d’installateurs Parallele sur le bucket client.

### 9) Livrables à l’utilisateur

- Chemin du nouveau dossier
- Project ID + IP API
- URL repo
- Config gcloud à activer
- Rappel : ouvrir **ce** dossier dans Cursor pour la suite (pas Parallele)
- Prochaine étape métier : build Server/Remote brandés + install école

## Scripts d’automatisation (à maintenir dans le repo modèle)

Le dépôt Parallele (modèle) doit exposer une feuille de route exécutable, ex. :

| Artefact | Rôle |
|----------|------|
| `.cursor/skills/schoolmatrix-tenant-clone/SKILL.md` | Ce brief (agent) |
| `.cursor/skills/schoolmatrix-cloud-db-seed/` | Saisie métier cloud (frais, salles) — recopier aussi vers `~\.cursor\skills\` |
| `docs/AGENCY-TENANT-CLONE.md` | Doc humaine / checklist |
| `infra/scripts/clone-schoolmatrix-tenant.ps1` | Orchestrateur (copie, remplacements, garde-fous) — à affiner au 1er essai |
| Bootstrap / assert paramétrables | GCP idempotent par `<PROJECT_ID>` / `<slug>` |

Copies hors repo (machine agence) :

| Chemin | Pour qui |
|--------|----------|
| `C:\Users\User\.cursor\skills\schoolmatrix-tenant-clone\` | Agent Cursor (portée globale) |
| `C:\Users\User\.cursor\skills\schoolmatrix-cloud-db-seed\` | Saisie métier cloud (tous les forks école) |
| `C:\Users\User\Documents\script de developpement\schoolmatrix-tenant-clone\` | Toi (porte de main Documents) |

Après chaque clone réel, l’agent **affine** scripts + skill d’après les frictions
(jusqu’à ~10 min). Notes opérationnelles nominatives (vrais clients) → **uniquement**
dans `Documents\script de developpement\` — **jamais** dans ce dépôt Parallele.
**Recopier le skill générique** aux emplacements agent (repo modèle + `.cursor/skills`
+ `script de developpement`) sans y coller de noms de clients réels.

## Leçons opérationnelles (génériques — 1er clone)

- Billing « compte 3 » = display name **Troisième Compte de facturation** → `01D27D-8BA5C8-721AC7`.
- Créer config gcloud `schoolmatrix-<slug>` **avant** bootstrap ; `CLOUDSDK_CORE_DISABLE_PROMPTS=1` pour éviter les prompts API Compute.
- Après bootstrap : remplacer l’IP placeholder par la vraie IP VM partout (`public-api`, `update-feed`, `defaults.env`, docs).
- Corriger le **project number** dans `docs/GCP-*.md` (ne pas laisser celui du modèle).
- `GEMINI_API_KEY` → Secret Manager du nouveau projet OK ; écriture `.env.prod` VM peut échouer sur invite SSH host key (Plink) — retry plus tard / IAP ; la clé reste en SM pour `prepare-server-stack`.
- `SYNC_API_KEY` : **nouvelle** clé par client (pas celle de Parallele).
- Logo provisoire = icônes Electron du modèle OK si le client n’a pas encore son logo.
- Ouvrir le **nouveau** dossier Cursor du client — jamais continuer dans Parallele.

## Anti-patterns (erreurs graves)

- Modifier Parallele « pour tester » le rebrand du client
- Écrire le nom / slug / IP / project ID d’un client réel **dans** le dépôt Parallele
- Réutiliser le bucket / la VM / le WIF Parallele
- Lancer `ship-all` du dossier Parallele en croyant publier le client
- Garder `34.95.43.132` dans le fork
- Faire tourner deux stacks Server Docker avec les **mêmes** `container_name`
- Committer `secrets/`, `.pem`, installateurs `.exe`, images `.tar`
- Demander à l’école / au client sa **propre** clé Gemini / OpenAI
- Générer ou laisser vide `GEMINI_API_KEY` sur un fork « pour l’isoler »
- Purger la clé IA en même temps que les secrets GCP Parallele sans la recopier

## Phrase de clôture attendue

« Fork \<Client\> prêt : dossier \<path\>, GCP \<project\>, API \<ip\>,
repo \<url\>. Ouvre ce dossier dans Cursor ; Parallele reste le modèle source. »
