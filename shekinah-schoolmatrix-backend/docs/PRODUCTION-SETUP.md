# Configuration production

## Production locale Windows (Docker + données persistantes)

Pour une installation **production locale sur Windows** avec un dossier de données sur l’hôte (PostgreSQL + stockage fichiers + configuration), voir le guide à la racine du dépôt :

- **[\docs\LOCAL-PRODUCTION-WINDOWS.md](../../docs/LOCAL-PRODUCTION-WINDOWS.md)** — dossier recommandé, bind mounts, emplacement de `.env.prod`, lancement depuis Electron.

---

## Tester en local avec une base vide (simulation prod)

1. Créer une base PostgreSQL vide (ou supprimer toutes les tables).
2. Configurer `.env.prod` (ou `.env.dev` avec les identifiants de cette base).
3. Lancer : `NODE_ENV=production npm run start:prod:bootstrap`  
   (sous Windows PowerShell : `$env:NODE_ENV="production"; npm run start:prod:bootstrap`).
4. Vérifier que les migrations s’exécutent puis que l’app démarre et que les seeds (rôles, school_profile) sont créés.

## Cycle de démarrage

1. Base PostgreSQL disponible
2. L'application attend la base (retry automatique)
3. Migrations TypeORM exécutées
4. Seeds système (rôles, school_profile)
5. Démarrage NestJS

Commande production avec bootstrap : `npm run start:prod:bootstrap`

## Stockage des fichiers

- **STORAGE_ROOT** : racine du stockage (défaut: `./storage`)
- Sous-dossiers : `profiles/`, `uploads/`, `backups/`
- Création automatique des dossiers au démarrage

### Rétrocompatibilité avec uploads à la racine

Si vous aviez `uploads/` à la racine du projet, configurez :
`STORAGE_ROOT=.` pour utiliser `./uploads`, `./profiles`, `./backups`.

### Docker

Monter un volume pour persister les fichiers :
```yaml
volumes:
  - schoolmatrix-storage:/app/storage
```

## S3 (optionnel)

Variables : `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_S3_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

Sans credentials S3, l'upload vers S3 est désactivé (fichiers uniquement en local).
