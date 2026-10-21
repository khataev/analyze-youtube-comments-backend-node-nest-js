import { type AppConfig, loadAppConfig } from '@/core/config/app.config';
import { TEST_DATABASE_URL } from './test-database-url';

/** Конфигурация для тестов: тот же разбор, что в приложении, без .env и process.env. */
export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadAppConfig({
    YOUTUBE_API_KEY: 'test-key',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    ...overrides,
  });
}
