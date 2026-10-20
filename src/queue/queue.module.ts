import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { type AppConfig, appConfig } from '../config/app.config';

export type QueueRole = 'producer' | 'worker';

/**
 * Общие настройки соединения BullMQ. Роль процесса определяет требования к соединению:
 *
 * - producer (API) только кладёт задачи. Как советует документация BullMQ, отключаем
 *   offline queue: при недоступном Redis `queue.add()` сразу падает, клиент получает 503.
 *
 * - worker ждёт задачи блокирующей командой BZPOPMIN. Здесь два требования:
 *   1) `maxRetriesPerRequest: null` — обязательное требование BullMQ к соединениям Worker
 *      (иначе ioredis бросит ошибку, исчерпав повторы, пока Redis перезапускается).
 *      BullMQ выставляет его и сам, но мы делаем это явно;
 *   2) НЕ задавать `commandTimeout`: он применяется и к блокирующей команде, и ioredis
 *      оборвал бы ожидание на паузах в очереди. В Python-версии ровно так и было
 *      с socket_timeout=5 в redis-py 8.
 *   BullMQ сам ограничивает блокировку (drainDelay) и переподключается при обрыве.
 */
@Module({})
export class QueueModule {
  static forRoot(role: QueueRole): DynamicModule {
    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          inject: [appConfig.KEY],
          useFactory: (config: AppConfig) => ({
            // BullMQ создаёт соединения ioredis сам: `new IORedis(url, остальные опции)`
            connection:
              role === 'producer'
                ? { url: config.redis.url, enableOfflineQueue: false, maxRetriesPerRequest: 1 }
                : { url: config.redis.url, maxRetriesPerRequest: null },
          }),
        }),
      ],
    };
  }
}
