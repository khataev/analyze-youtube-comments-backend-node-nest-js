import { type ConfigType, registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envSchema } from './env.schema';

/**
 * Разбирает окружение и раскладывает его по группам с camelCase-именами.
 * Код приложения работает только с этим объектом, а не с process.env.
 */
export function loadAppConfig(env: Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Исключение на этапе инициализации модулей роняет процесс: лучше сразу, чем на первом запросе
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    corsOrigins: e.CORS_ORIGINS,
    redis: { url: e.REDIS_URL },
    youtube: { apiKey: e.YOUTUBE_API_KEY, maxComments: e.YOUTUBE_MAX_COMMENTS },
    llm: {
      model: e.LLM_MODEL,
      apiKey: e.LLM_API_KEY,
      batchSize: e.LLM_BATCH_SIZE,
      concurrency: e.LLM_CONCURRENCY,
    },
    tasks: { ttlSeconds: e.TASK_TTL_SECONDS },
    worker: { concurrency: e.WORKER_CONCURRENCY },
  };
}

/**
 * Пространство имён конфигурации. registerAs создаёт провайдер с токеном appConfig.KEY,
 * поэтому настройки внедряются как обычная зависимость:
 *
 *   constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {}
 *
 * Это ближе всего к `Depends(get_settings)` из FastAPI. В тестах подменяется через
 * overrideProvider(appConfig.KEY).useValue(...).
 */
export const appConfig = registerAs('app', () => loadAppConfig(process.env));

export type AppConfig = ConfigType<typeof appConfig>;
