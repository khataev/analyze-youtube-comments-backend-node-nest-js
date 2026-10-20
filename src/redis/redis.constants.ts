/**
 * Injection-токен клиента Redis. Токен нужен, когда зависимость — не наш класс:
 * `@Inject(REDIS_CLIENT) redis: Redis`. В тестах подменяется через overrideProvider(REDIS_CLIENT).
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
