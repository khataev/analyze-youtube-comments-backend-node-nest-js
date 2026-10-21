import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Алиасы @/ и @test/ из tsconfig.json
  resolve: { tsconfigPaths: true },
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    // Один раз на прогон: тестовая база и миграции. Каждый тест — в транзакции с откатом
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Из внешних сервисов тестам нужен только Postgres; .env не читается
    env: { NODE_ENV: 'test' },
  },
  // esbuild (дефолт Vite) не умеет emitDecoratorMetadata, без которой не работает DI Nest.
  // Поэтому TypeScript компилирует SWC — рецепт из документации Nest
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
