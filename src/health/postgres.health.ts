import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Pool } from 'pg';
import { PG_POOL } from '@/database/database.constants';

/** Свой индикатор: готовые в terminus есть для TypeORM, Prisma и MikroORM, но не для Drizzle. */
@Injectable()
export class PostgresHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async check(key: string) {
    const indicator = this.health.check(key);
    try {
      await this.pool.query('select 1');
      return indicator.up();
    } catch {
      return indicator.down({ message: 'Storage is unavailable' });
    }
  }
}
