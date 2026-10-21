import { Pool } from 'pg';

/**
 * Пул соединений. Соединение берётся из пула на одну операцию и сразу возвращается,
 * поэтому даже минутная обработка задачи в воркере не держит соединение.
 */
export function createPool(url: string, onError: (err: Error) => void): Pool {
  const pool = new Pool({
    connectionString: url,
    max: 10,
    // Недоступная база → ошибка через 5 секунд (и 503 у API), а не зависший запрос
    connectionTimeoutMillis: 5_000,
  });
  // Без обработчика ошибка простаивающего соединения (например, рестарт Postgres) роняет процесс
  pool.on('error', onError);
  return pool;
}

/** Коды, по которым ясно, что база недоступна, а не что запрос неверен. */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  '57P01', // admin_shutdown: сервер останавливается
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now: сервер запускается
  '53300', // too_many_connections
]);

/** Сообщения node-postgres без кода: таймаут подключения, обрыв соединения. */
const UNAVAILABLE_MESSAGE = /timeout exceeded when trying to connect|connection terminated/i;

/**
 * Ошибка соединения с базой, а не ошибка запроса. Drizzle оборачивает ошибку драйвера
 * в DrizzleQueryError, поэтому смотрим всю цепочку cause.
 */
export function isConnectionError(err: unknown): boolean {
  for (let current = err, depth = 0; current instanceof Error && depth < 5; depth++) {
    const code = (current as NodeJS.ErrnoException).code;
    if (code !== undefined && (UNAVAILABLE_CODES.has(code) || code.startsWith('08'))) return true;
    if (UNAVAILABLE_MESSAGE.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/** Сообщение для логов. У ECONNREFUSED (AggregateError) пустой message, суть — в code. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.message || (err as NodeJS.ErrnoException).code || err.name;
}
