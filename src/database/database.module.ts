import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { redactUrl } from '@/common/redact-url';
import { type AppConfig, appConfig } from '@/config/app.config';
import { DATABASE, PG_POOL } from './database.constants';
import { createPool, describeError } from './postgres';

const logger = new Logger('Postgres');

/** Пул создаётся один раз при старте; пробный запрос только для лога, как у Redis. */
const poolProvider = {
  provide: PG_POOL,
  inject: [appConfig.KEY],
  useFactory: async (config: AppConfig): Promise<Pool> => {
    const url = redactUrl(config.database.url);
    const pool = createPool(config.database.url, (err) => {
      logger.warn(`Postgres ${url}: ${describeError(err)}`);
    });
    try {
      await pool.query('select 1');
      logger.log(`Connected to Postgres ${url}`);
    } catch (err) {
      // Не падаем: база может подняться позже, пул откроет новые соединения сам.
      // Пока её нет, запросы к хранилищу получают 503
      logger.warn(`Postgres ${url} is unavailable: ${describeError(err)}`);
    }
    return pool;
  },
};

const databaseProvider = {
  provide: DATABASE,
  inject: [PG_POOL],
  useFactory: (pool: Pool) => drizzle({ client: pool }),
};

/**
 * Подключение к Postgres. @Global: это инфраструктура, которую
 * внедряют репозитории разных модулей. Аналог engine и sessionmaker в Python-версии.
 */
@Global()
@Module({
  providers: [poolProvider, databaseProvider],
  exports: [PG_POOL, DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
