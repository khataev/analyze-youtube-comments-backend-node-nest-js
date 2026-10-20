import { Module } from '@nestjs/common';
import { AnalysisModule } from './analysis/analysis.module';
import { ConfigModule } from './config/config.module';
import { LoggingModule } from './logging/logging.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

/** Корневой модуль воркера: те же инфраструктурные модули, но без HTTP и health. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    RedisModule,
    QueueModule.forRoot('worker'),
    AnalysisModule.forWorker(),
  ],
})
export class WorkerModule {}
