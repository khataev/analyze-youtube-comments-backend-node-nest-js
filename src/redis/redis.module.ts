import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { type AppConfig, appConfig } from '@/config/app.config';
import { redactUrl } from '@/common/redact-url';
import { REDIS_CLIENT } from './redis.constants';

const logger = new Logger('Redis');

/**
 * Провайдер-фабрика: Nest вызывает её один раз при старте (провайдеры — синглтоны),
 * дожидается промиса и раздаёт один и тот же клиент всем, кто его внедряет.
 * Аналог создания клиента в lifespan FastAPI.
 */
const redisClientProvider = {
  provide: REDIS_CLIENT,
  inject: [appConfig.KEY],
  useFactory: async (config: AppConfig): Promise<Redis> => {
    const url = redactUrl(config.redis.url);
    const client = new Redis(config.redis.url, {
      // Этот клиент нужен только health-check (PING), поэтому падаем быстро:
      // при недоступном Redis /health сразу ответит 503, а не повиснет.
      // (Блокирующее ожидание очереди идёт через отдельные соединения BullMQ, см. QueueModule.)
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 2_000,
      connectTimeout: 5_000,
    });
    // Без обработчика ioredis пишет «Unhandled error event» в stderr на каждый реконнект
    client.on('error', (err: NodeJS.ErrnoException) => {
      // У ECONNREFUSED (AggregateError) пустой message, суть — в code
      logger.warn(`Redis ${url}: ${err.message || err.code || err.name}`);
    });
    try {
      await client.connect();
      logger.log(`Connected to Redis ${url}`);
    } catch (err) {
      // Не падаем: Redis может подняться позже, ioredis переподключится сам
      logger.warn(`Redis ${url} is unavailable: ${(err as Error).message}`);
    }
    return client;
  },
};

/**
 * @Global — провайдеры модуля доступны везде без импорта. Для инфраструктуры вроде
 * клиента БД это нормально, для доменных модулей — нет (там зависимости явные).
 */
@Global()
@Module({
  providers: [redisClientProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Lifecycle hook: вызывается при app.close() и по SIGTERM (если включены shutdown hooks). */
  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
