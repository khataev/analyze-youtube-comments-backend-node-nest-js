import { type AppConfig, loadAppConfig } from '../../src/config/app.config';

/** Конфигурация для тестов: тот же разбор, что в приложении, без .env и process.env. */
export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadAppConfig({ YOUTUBE_API_KEY: 'test-key', LOG_LEVEL: 'silent', ...overrides });
}
