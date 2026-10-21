import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AnalysisModule } from './analysis/analysis.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

/**
 * Корневой модуль HTTP-процесса. Глобальные pipe и filter регистрируются как провайдеры
 * (APP_PIPE / APP_FILTER), а не через app.useGlobalPipes() в main.ts: так они участвуют в DI
 * и автоматически действуют в e2e-тестах, которые собирают этот же модуль.
 */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    QueueModule.forRoot('producer'),
    HealthModule,
    AnalysisModule.forApi(),
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class ApiModule {}
