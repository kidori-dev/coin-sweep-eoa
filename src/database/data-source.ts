import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv({ path: '.env.local' });
loadEnv();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'coin_sweep',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
  uuidExtension: 'pgcrypto' as const,
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
};

export default new DataSource(dataSourceOptions);
