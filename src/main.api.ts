import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ApiModule } from './api.module';
import { redactUrl } from './common/redact-url';
import { type AppConfig, appConfig } from './core/config/app.config';
import { ANALYSIS_QUEUE } from './core/queue/queue.constants';

async function bootstrap(): Promise<void> {
  // bufferLogs: логи, написанные до useLogger(), не уходят в стандартный логгер, а ждут pino
  const app = await NestFactory.create(ApiModule, { bufferLogs: true, abortOnError: false });
  app.useLogger(app.get(Logger));
  // Обычный логгер Nest: после useLogger() он пишет в pino. Сигнатура (поля, сообщение)
  const logger = new NestLogger('Api');
  // SIGTERM/SIGINT → app.close() → onModuleDestroy/onApplicationShutdown у всех провайдеров:
  // сервер перестаёт принимать запросы, закрываются соединения с Redis и очередью
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(appConfig.KEY);
  app.enableCors({ origin: config.corsOrigins });

  await app.listen(config.port, '0.0.0.0');
  logger.log(
    {
      postgres: redactUrl(config.database.url),
      redis: redactUrl(config.redis.url),
      queue: ANALYSIS_QUEUE,
      port: config.port,
    },
    'API ready: tasks go to the queue',
  );
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
