import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/** Токен модели AI SDK. Классификатор получает готовую модель и не знает о провайдерах. */
export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');

/**
 * Поддерживаемые провайдеры. Новый провайдер — одна строка здесь и пакет @ai-sdk/<provider>.
 * Без apiKey провайдер ищет ключ в своей переменной окружения (DEEPSEEK_API_KEY и т.п.).
 */
const PROVIDERS = {
  deepseek: (apiKey?: string) => createDeepSeek({ apiKey }),
  openai: (apiKey?: string) => createOpenAI({ apiKey }),
  anthropic: (apiKey?: string) => createAnthropic({ apiKey }),
} as const;

type ProviderName = keyof typeof PROVIDERS;

/** `LLM_MODEL=provider:model` → модель AI SDK. Ошибка в настройке роняет воркер на старте. */
export function createLanguageModel(spec: string, apiKey: string | undefined): LanguageModel {
  const separator = spec.indexOf(':');
  const provider = spec.slice(0, separator);
  const modelId = spec.slice(separator + 1);
  if (!isProvider(provider)) {
    throw new Error(
      `Unsupported LLM provider "${provider}" in LLM_MODEL. Supported: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }
  return PROVIDERS[provider](apiKey)(modelId);
}

function isProvider(name: string): name is ProviderName {
  return Object.hasOwn(PROVIDERS, name);
}
