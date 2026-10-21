import { z } from 'zod';

/*
 * Схемы переменных окружения. Имена и значения по умолчанию совпадают с Python-версией
 * (см. .env.example), кроме адресов: у каждой реализации своя база Postgres и номер БД Redis.
 *
 * Аналог pydantic-settings: строки из окружения приводятся к типам, при ошибке
 * процесс падает на старте с перечнем проблем (см. loadAppConfig).
 */

/**
 * Минимум для команд БД (создание базы, миграции): им не нужны ключи YouTube и LLM.
 * Аналог отдельных DatabaseSettings в Python-версии.
 */
export const databaseEnvSchema = z.object({
  // Формат node-postgres; в Python-версии тот же адрес записан как postgresql+asyncpg://
  DATABASE_URL: z
    .string()
    .default('postgres://app:app@localhost:5432/analysis_node')
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      'must start with postgres:// or postgresql://',
    ),
  LOG_LEVEL: z
    .string()
    .default('INFO')
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(['trace', 'debug', 'info', 'warn', 'warning', 'error', 'fatal', 'silent']))
    .transform((value) => (value === 'warning' ? 'warn' : value)),
});

/** Полная схема для API и воркера. */
export const envSchema = databaseEnvSchema.extend({
  REDIS_URL: z
    .string()
    .default('redis://localhost:6379/2')
    .refine((value) => /^rediss?:\/\//.test(value), 'must start with redis:// or rediss://'),
  CORS_ORIGINS: z
    .string()
    .default('["http://localhost:5173"]')
    .transform((value, ctx) => {
      // Формат как у pydantic-settings: JSON-массив строк
      try {
        return z.array(z.string()).parse(JSON.parse(value));
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be a JSON array of strings' });
        return z.NEVER;
      }
    }),

  YOUTUBE_API_KEY: z.string().min(1, 'is required'),
  YOUTUBE_MAX_COMMENTS: z.coerce.number().int().positive().default(200),

  LLM_MODEL: z
    .string()
    .default('deepseek:deepseek-chat')
    .refine((value) => /^[\w-]+:.+$/.test(value), 'must look like "provider:model"'),
  // Пустая строка из .env = «не задан»: провайдер возьмёт ключ из своей переменной (DEEPSEEK_API_KEY и т.п.)
  LLM_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  LLM_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  LLM_CONCURRENCY: z.coerce.number().int().positive().default(4),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
});
