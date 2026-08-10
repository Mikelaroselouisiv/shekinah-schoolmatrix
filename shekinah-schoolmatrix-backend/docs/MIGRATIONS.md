# Migrations TypeORM

## Ordre des migrations (base vide → production)

1. **1738000000000-InitialBusinessSchema** : crée tout le schéma métier (role, users, school_profile, room, subject, academic_year, period, class, student, grades, economat, discipline, etc.).
2. **1739000000000-InitialSchema** : crée les tables de fondation sync (sync_nodes, sync_events).
3. **1739000000001-FileMetadata** : crée la table file_metadata.

Sur une base PostgreSQL totalement vide, l’exécution de ces trois migrations crée l’intégralité du schéma. Les seeds système (rôles, school_profile) s’exécutent au démarrage de l’app.

## Passage de synchronize aux migrations

### En développement
- `synchronize: true` reste actif : le schéma suit les entités automatiquement.
- Vous pouvez continuer à développer sans exécuter de migrations.

### En production
- `synchronize: false` : le schéma est géré uniquement par les migrations.
- Au démarrage : `npm run start:prod:bootstrap` exécute les migrations puis lance l’app.

## Scripts disponibles

| Script | Description |
|--------|-------------|
| `npm run migration:run` | Build + exécute les migrations |
| `npm run migration:run:prod` | Exécute les migrations (sans build, après build) |
| `npm run migration:generate` | Génère une migration à partir des changements d'entités |
| `npm run migration:revert` | Annule la dernière migration |
| `npm run migration:show` | Affiche l'état des migrations |

## Générer une migration initiale complète

Pour obtenir une migration qui crée tout le schéma (à partir d'une base vide) :

1. Créer une base de données vide
2. Configurer `.env.dev` avec les identifiants
3. Exécuter : `npm run migration:generate`

TypeORM compare les entités avec la base et génère `src/migrations/SchemaUpdate-XXXXX.ts`.

## Fichiers

- `src/data-source.ts` : DataSource pour le CLI TypeORM (migrations)
- `src/migrations/1738000000000-InitialBusinessSchema.ts` : schéma métier complet
- `src/migrations/1739000000000-InitialSchema.ts` : tables sync (sync_nodes, sync_events)
- `src/migrations/1739000000001-FileMetadata.ts` : table file_metadata
