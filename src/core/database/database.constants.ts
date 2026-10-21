import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';

/** Пул соединений node-postgres (pg.Pool). */
export const PG_POOL = Symbol('PG_POOL');
/** Экземпляр Drizzle поверх пула. Репозитории внедряют его, а не пул. */
export const DATABASE = Symbol('DATABASE');

/**
 * Общий тип для экземпляра Drizzle и открытой в нём транзакции: API запросов у них одинаковый.
 * Поэтому тесты могут подставить вместо базы свою транзакцию с откатом (см. test/support/database.ts).
 */
export type Database = PgDatabase<NodePgQueryResultHKT>;
