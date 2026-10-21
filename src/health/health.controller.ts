import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres.health';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * 200 `{"status": "ok", ...}` или 503 `{"status": "error", ...}` (бросает сам terminus).
   * Проверки идут параллельно: Postgres — хранилище задач, Redis — очередь.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.postgres.check('postgres'),
      () => this.redis.check('redis'),
    ]);
  }
}
