import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { ApiModule } from '../../src/api.module';
import { appConfig } from '../../src/config/app.config';
import { DATABASE, type Database, PG_POOL } from '../../src/database/database.constants';
import { ANALYSIS_QUEUE } from '../../src/queue/queue.constants';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';
import { testConfig } from './config';
import { fakeRedis } from './fakes';

interface ApiAppOptions {
  /** Транзакция теста из useTestDatabase() или unreachableDatabase().db. */
  db: Database;
  redis?: ReturnType<typeof fakeRedis>;
  /** Пул для health-check; по умолчанию настоящий пул к тестовой базе. */
  pool?: { query: (sql: string) => Promise<unknown> };
}

/**
 * Настоящий ApiModule (контроллеры, глобальные pipe и filter, health), у которого
 * внешние зависимости подменены через overrideProvider:
 *   - DATABASE → транзакция теста в тестовой базе (откатывается после теста);
 *   - Redis → фейк с ping() (Redis нужен только health-check);
 *   - Queue BullMQ → объект с замоканным add(): проверяем, что API поставил задачу.
 * Аналог app.dependency_overrides в FastAPI.
 */
export async function createApiApp(options: ApiAppOptions) {
  const queue = { add: vi.fn().mockResolvedValue({}) };

  let builder = Test.createTestingModule({ imports: [ApiModule] })
    .overrideProvider(appConfig.KEY)
    .useValue(testConfig())
    .overrideProvider(DATABASE)
    .useValue(options.db)
    .overrideProvider(REDIS_CLIENT)
    .useValue(options.redis ?? fakeRedis())
    .overrideProvider(getQueueToken(ANALYSIS_QUEUE))
    .useValue(queue);
  if (options.pool) {
    builder = builder.overrideProvider(PG_POOL).useValue({ ...options.pool, end: async () => {} });
  }
  const moduleRef = await builder.compile();

  const app: INestApplication = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return { app, queue };
}
