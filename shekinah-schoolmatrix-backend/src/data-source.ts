/**
 * DataSource TypeORM pour les migrations (CLI).
 * Utilisé par: migration:run, migration:generate, migration:revert
 * Charge les variables d'environnement depuis .env.dev ou .env.prod selon NODE_ENV.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

const envFile =
  process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev';
config({ path: resolve(process.cwd(), envFile) });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'schoolmatrix',
  password: process.env.DB_PASS ?? 'schoolmatrix',
  database: process.env.DB_NAME ?? 'schoolmatrix',
  synchronize: false,
  migrationsTableName: 'typeorm_migrations',
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
});
