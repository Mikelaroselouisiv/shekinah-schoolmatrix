# Espace DEV (poste développeur)

Utilitaires pour le **développement local** uniquement.

| Fichier | Rôle |
|---------|------|
| `docker-compose.postgres.yml` | Postgres `shekinah-db-dev` (port **5436**) |
| `docker-compose.sync-cloud.yml` | Postgres miroir lab `shekinah-db-cloud-dev` (port **5437**) — pas GCP |
| `stop-local-server-stack.ps1` | Arrête le stack « Server école » s’il tourne par erreur sur ce PC (libère `:3000`) |
| `normalize-dev-grades-haitian.sql` | Recale les notes DEV (anciennes /20) vers barèmes 100–500. **Uniquement** `shekinah-db-dev` |

Voir [docs/DEV.md](../docs/DEV.md) et [docs/ENVIRONMENTS.md](../docs/ENVIRONMENTS.md).

**Ne pas** mettre ici de compose GCP ni de stack installateur école.
