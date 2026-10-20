import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { ApiModule } from '../../src/api.module';
import { TaskRepository } from '../../src/analysis/task.repository';
import { appConfig } from '../../src/config/app.config';
import { ANALYSIS_QUEUE } from '../../src/queue/queue.constants';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';
import { testConfig } from './config';
import { fakeRedis, InMemoryTaskRepository } from './fakes';

/**
 * Настоящий ApiModule (контроллеры, глобальные pipe и filter, health), у которого
 * внешние зависимости подменены через overrideProvider:
 *   - Redis → фейк с ping();
 *   - TaskRepository → Map в памяти;
 *   - Queue BullMQ → объект с замоканным add(): проверяем, что API поставил задачу.
 * Аналог app.dependency_overrides в FastAPI.
 */
export async function createApiApp(options: { redis?: ReturnType<typeof fakeRedis> } = {}) {
  const repository = new InMemoryTaskRepository();
  const queue = { add: vi.fn().mockResolvedValue({}) };

  const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
    .overrideProvider(appConfig.KEY)
    .useValue(testConfig())
    .overrideProvider(REDIS_CLIENT)
    .useValue(options.redis ?? fakeRedis())
    .overrideProvider(TaskRepository)
    .useValue(repository)
    .overrideProvider(getQueueToken(ANALYSIS_QUEUE))
    .useValue(queue)
    .compile();

  const app: INestApplication = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return { app, repository, queue };
}
