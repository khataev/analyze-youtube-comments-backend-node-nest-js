import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { redactUrl } from './common/redact-url';
import { type AppConfig, appConfig } from './config/app.config';
import { ANALYSIS_QUEUE } from './queue/queue.constants';
import { WorkerModule } from './worker.module';

/**
 * Воркер — отдельный процесс без HTTP. createApplicationContext собирает тот же граф
 * модулей и провайдеров, что и NestFactory.create, но не поднимает сервер.
 * Аналог `bundle exec sidekiq`: процесс живёт, пока работает Worker BullMQ.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  // Обычный логгер Nest: после useLogger() он пишет в pino. Сигнатура (поля, сообщение)
  const logger = new NestLogger('Worker');
  // По SIGTERM @nestjs/bullmq вызывает worker.close(): новые задачи не берутся,
  // текущие дорабатываются, затем закрываются соединения
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(appConfig.KEY);
  logger.log(
    {
      postgres: redactUrl(config.database.url),
      redis: redactUrl(config.redis.url),
      queue: ANALYSIS_QUEUE,
      concurrency: config.worker.concurrency,
      llm_model: config.llm.model,
      llm_key_from: config.llm.apiKey ? 'LLM_API_KEY' : 'provider env var',
      max_comments: config.youtube.maxComments,
    },
    'Worker ready: listening to the queue',
  );
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
