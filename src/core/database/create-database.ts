import { Client, escapeIdentifier } from 'pg';

/**
 * Создать базу из URL, если её нет. Аналог `rails db:create`: в Postgres нет
 * `CREATE DATABASE IF NOT EXISTS`, поэтому сначала смотрим в pg_database.
 * Подключаемся к служебной базе `postgres` того же сервера с теми же учётными данными.
 *
 * @returns true, если база создана; false, если уже была.
 */
export async function createDatabaseIfMissing(url: string): Promise<boolean> {
  const name = databaseName(url);
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = '/postgres';

  const client = new Client({
    connectionString: maintenanceUrl.toString(),
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  try {
    const existing = await client.query('select 1 from pg_database where datname = $1', [name]);
    if (existing.rowCount) return false;
    // Имя базы нельзя передать параметром запроса, только экранированным идентификатором
    await client.query(`create database ${escapeIdentifier(name)}`);
    return true;
  } catch (err) {
    // Гонка: другой процесс (например, второй migrate) успел создать базу между запросами
    if ((err as { code?: string }).code === DUPLICATE_DATABASE) return false;
    throw err;
  } finally {
    await client.end();
  }
}

export function databaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name) throw new Error('DATABASE_URL must include a database name');
  return name;
}

const DUPLICATE_DATABASE = '42P04';
