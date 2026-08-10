# Shekinah SchoolMatrix — Application desktop

L’application lance les conteneurs Docker et affiche le frontend. **Au premier lancement**, un **assistant d’installation** (style panneau de configuration) permet de tout configurer avant tout démarrage.

## Deux dossiers distincts

1. **Dossier d’installation du logiciel**  
   Choisi lors de l’installation (setup.exe) : où sont installés l’exe et les fichiers de l’app.

2. **Dossier des données**  
   Choisi dans l’assistant d’installation : où sont créés :
   - `postgres_data/`
   - `storage/`, `storage/uploads`, `storage/profiles`, `storage/backups`
   - `.env`, `.env.prod` (remplis via le formulaire de l’assistant)
   - `scripts/` et les fichiers `docker-compose.*.yml` (copiés depuis l’app)

Sans cette configuration, l’app ne peut pas démarrer les conteneurs.

## Assistant d’installation (premier lancement)

Au premier lancement, une fenêtre **Installation** s’ouvre avec les étapes suivantes :

1. **Emplacement des données** — Choix (ou création) du dossier des données (par défaut `C:/SchoolMatrix`).
2. **Prérequis** — Vérification de Node.js, Docker et AWS CLI ; liens de téléchargement si manquants.
3. **Configuration** — Formulaire pour remplir toute la configuration de base : PostgreSQL, JWT, ECR, AWS (credentials et S3). Un fichier `.env` complet est généré dans le dossier des données.
4. **Téléchargement ECR** — Option pour télécharger tout de suite la dernière version des images depuis ECR.
5. **Terminer** — Option « Lancer l’application maintenant » ou quitter.

Une fois l’assistant terminé, la configuration est enregistrée ; les lancements suivants ouvrent directement l’application (démarrage des conteneurs ou fenêtre « À faire » si les conteneurs n’existent pas encore).

## Configuration uniquement (sans l’assistant)

Pour ne faire que choisir le dossier des données puis quitter (ancien mode) :

```text
Shekinah SchoolMatrix.exe --setup
```

Utile si vous préférez configurer à la main sans passer par l’assistant.

## Build

```bash
cd desktop
npm install
npm run build
# ou
npm run build:win
```

Les scripts, `installer.html` et les docker-compose à la racine du projet sont inclus dans le build (`extraResources`). Le dossier de sortie est `dist/`.

## Mode développement

```bash
npm start
# ou
npm start -- --dev
```

Avec `--dev`, l’app utilise le dossier parent (racine du repo) comme projet et ne démarre pas les conteneurs (frontend local attendu).
