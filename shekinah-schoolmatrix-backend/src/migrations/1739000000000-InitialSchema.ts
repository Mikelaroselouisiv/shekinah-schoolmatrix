import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration initiale — crée les tables si absentes.
 * Idempotent : utilise IF NOT EXISTS où possible.
 * À utiliser pour bootstrap d'un environnement vierge.
 * En dev avec synchronize: true, cette migration peut être vide ou skip.
 */
export class InitialSchema1739000000000 implements MigrationInterface {
  name = 'InitialSchema1739000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La table typeorm_migrations est créée automatiquement par TypeORM
    // Cette migration initiale permet de démarrer sur une base vide.
    // Si vous utilisez migration:generate, TypeORM génèrera le schéma complet.
    // Pour l'instant, on laisse le schéma à synchronize en dev.
    // En production : exécutez d'abord migration:generate depuis une base dev
    // pour obtenir une migration complète, puis migration:run en prod.
    await queryRunner.query(`
      -- Table de trace pour les nœuds de sync (fondation future)
      CREATE TABLE IF NOT EXISTS sync_nodes (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await queryRunner.query(`
      -- Table d'événements de sync (fondation future)
      CREATE TABLE IF NOT EXISTS sync_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        node_id VARCHAR(64) NOT NULL,
        entity_type VARCHAR(128) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sync_events_node_created ON sync_events(node_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sync_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS sync_nodes`);
  }
}
