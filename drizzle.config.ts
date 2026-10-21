import { defineConfig } from 'drizzle-kit';

/**
 * Настройки drizzle-kit — только для генерации миграций (`npm run db:generate`), аналог
 * `alembic revision --autogenerate`. Применяет миграции наш скрипт (src/database/cli.ts),
 * поэтому drizzle-kit остаётся dev-зависимостью и в образ не попадает.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/analysis/analysis-task.table.ts',
  out: './drizzle',
});
