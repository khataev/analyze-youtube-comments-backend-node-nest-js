import { defineConfig } from 'drizzle-kit';

/**
 * Настройки drizzle-kit — только для генерации миграций (`npm run db:generate`), аналог
 * `alembic revision --autogenerate`. Применяет миграции наш скрипт (src/core/database/cli.ts),
 * поэтому drizzle-kit остаётся dev-зависимостью и в образ не попадает.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/analysis/analysis-task.table.ts',
  out: './drizzle',
});
