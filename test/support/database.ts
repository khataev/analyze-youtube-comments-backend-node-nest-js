import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import type { Database } from '../../src/database/database.constants';
import { TEST_DATABASE_URL } from './test-database-url';

class RollbackTestTransaction extends Error {}

/**
 * Схему накатывает test/global-setup.ts один раз на прогон.
 * Каждый тест — внутри транзакции, которая в конце откатывается (как в Rails).
 * Возвращает функцию, отдающую транзакцию текущего теста: её подставляют вместо токена
 * DATABASE. Вложенный db.transaction() в коде приложения станет SAVEPOINT.
 *
 * Drizzle открывает транзакцию только на время колбэка, поэтому колбэк держим открытым
 * до afterEach, а там завершаем исключением — Drizzle делает ROLLBACK.
 * Все запросы теста идут через одно соединение: node-postgres выполняет их по очереди.
 */
export function useTestDatabase(): () => Database {
  let pool: Pool;
  let current: { tx: Database; rollback: () => Promise<void> } | undefined;

  beforeAll(() => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  });

  beforeEach(async () => {
    current = await openTransaction(drizzle({ client: pool }));
  });

  afterEach(async () => {
    await current?.rollback();
    current = undefined;
  });

  afterAll(async () => {
    await pool.end();
  });

  return () => {
    if (!current) throw new Error('useTestDatabase(): the transaction exists only inside a test');
    return current.tx;
  };
}

async function openTransaction(db: Database) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let opened!: (tx: Database) => void;
  const ready = new Promise<Database>((resolve) => (opened = resolve));

  const finished = db
    .transaction(async (tx) => {
      opened(tx);
      await released;
      throw new RollbackTestTransaction();
    })
    .catch((err: unknown) => {
      if (!(err instanceof RollbackTestTransaction)) throw err;
    });

  // Если BEGIN не прошёл, finished завершится ошибкой раньше, чем откроется транзакция
  const tx = await Promise.race([
    ready,
    finished.then(() => {
      throw new Error('Test transaction ended before the test started');
    }),
  ]);
  return {
    tx,
    rollback: async () => {
      release();
      await finished;
    },
  };
}

/** База, до которой не достучаться: для проверки 503 при недоступном Postgres. */
export function unreachableDatabase(): { db: Database; pool: Pool } {
  const pool = new Pool({
    connectionString: 'postgres://app:app@127.0.0.1:1/unreachable',
    connectionTimeoutMillis: 500,
  });
  return { db: drizzle({ client: pool }), pool };
}
