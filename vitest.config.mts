import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Тестам не нужны ни .env, ни внешние сервисы
    env: { NODE_ENV: 'test' },
  },
  // esbuild (дефолт Vite) не умеет emitDecoratorMetadata, без которой не работает DI Nest.
  // Поэтому TypeScript компилирует SWC — рецепт из документации Nest
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
