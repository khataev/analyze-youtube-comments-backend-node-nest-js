import { describe, expect, it } from 'vitest';
import { loadAppConfig, loadDatabaseConfig } from '../../src/config/app.config';

describe('loadAppConfig', () => {
  it('applies defaults compatible with the Python version', () => {
    const config = loadAppConfig({ YOUTUBE_API_KEY: 'key' });

    expect(config).toMatchObject({
      port: 8000,
      logLevel: 'info',
      corsOrigins: ['http://localhost:5173'],
      database: { url: 'postgres://app:app@localhost:5432/analysis_node' },
      redis: { url: 'redis://localhost:6379/2' },
      youtube: { apiKey: 'key', maxComments: 200 },
      llm: { model: 'deepseek:deepseek-chat', apiKey: undefined, batchSize: 50, concurrency: 4 },
      tasks: { ttlSeconds: 86_400 },
    });
  });

  it('parses values from strings', () => {
    const config = loadAppConfig({
      YOUTUBE_API_KEY: 'key',
      CORS_ORIGINS: '["http://a", "http://b"]',
      LOG_LEVEL: 'WARNING',
      LLM_BATCH_SIZE: '10',
      LLM_API_KEY: '',
    });

    expect(config.corsOrigins).toEqual(['http://a', 'http://b']);
    expect(config.logLevel).toBe('warn');
    expect(config.llm.batchSize).toBe(10);
    expect(config.llm.apiKey).toBeUndefined();
  });

  it('fails with a readable message listing every problem', () => {
    expect(() =>
      loadAppConfig({ LLM_BATCH_SIZE: '0', LLM_MODEL: 'no-provider', REDIS_URL: 'http://x' }),
    ).toThrow(/YOUTUBE_API_KEY[\s\S]*REDIS_URL|REDIS_URL[\s\S]*YOUTUBE_API_KEY/);
    expect(() => loadAppConfig({ YOUTUBE_API_KEY: 'key', LLM_MODEL: 'gpt' })).toThrow(
      /provider:model/,
    );
  });

  it('loads database settings without YouTube and LLM keys', () => {
    const config = loadDatabaseConfig({ DATABASE_URL: 'postgresql://u:p@db:5432/x' });

    expect(config).toEqual({ logLevel: 'info', database: { url: 'postgresql://u:p@db:5432/x' } });
    expect(() => loadDatabaseConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });
});
