import { Client } from 'pg';
import { createDatabaseIfMissing } from '../src/database/create-database';
import { runMigrations } from '../src/database/migrate';
import { describeError, isConnectionError } from '../src/database/postgres';
import { TEST_DATABASE_URL } from './support/test-database-url';

/**
 * Один раз на прогон, до всех тестов (globalSetup Vitest): создать тестовую базу и накатить
 * на неё миграции с нуля. Аналог `rails db:test:prepare`, но через миграции: заодно
 * проверяется, что они применяются к пустой базе.
 */
export default async function setup(): Promise<void> {
  try {
    await createDatabaseIfMissing(TEST_DATABASE_URL);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    // Одно понятное сообщение вместо десятка одинаковых ошибок соединения в каждом тесте
    throw new Error(
      `Postgres is unavailable (${describeError(err)}). ` +
        'Start the shared infrastructure: docker compose -f ../docker-compose.yml up -d',
      { cause: err },
    );
  }
  await resetSchema();
  await runMigrations(TEST_DATABASE_URL);
}

/** Удалить таблицы и историю миграций Drizzle (схема drizzle), оставив пустую public. */
async function resetSchema(): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      'drop schema if exists drizzle cascade; drop schema public cascade; create schema public',
    );
  } finally {
    await client.end();
  }
}
