import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

/** SQL-миграции, сгенерированные drizzle-kit. Путь от этого файла: работает и из src, и из dist. */
export const MIGRATIONS_DIR = resolve(__dirname, '..', '..', '..', 'drizzle');

/**
 * Применить новые миграции, аналог `alembic upgrade head` / `rails db:migrate`.
 * Применённые Drizzle записывает в таблицу drizzle.__drizzle_migrations.
 */
export async function runMigrations(url: string): Promise<void> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}
