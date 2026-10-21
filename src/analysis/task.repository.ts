import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { StorageUnavailableError } from '../common/errors/domain.error';
import { type AppConfig, appConfig } from '../config/app.config';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  serializeAnalysisTask,
  storedAnalysisTaskSchema,
  type AnalysisTask,
} from './domain/analysis-task';

/**
 * Хранение статусов задач. Сервисы не знают, что внутри Redis: его можно заменить на БД,
 * поменяв только этот класс. Ошибки соединения переводятся в доменную StorageUnavailableError.
 */
@Injectable()
export class TaskRepository {
  static readonly KEY_PREFIX = 'analysis:task:';

  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(appConfig.KEY) config: AppConfig,
  ) {
    this.ttlSeconds = config.tasks.ttlSeconds;
  }

  async save(task: AnalysisTask): Promise<AnalysisTask> {
    const updated = { ...task, updatedAt: new Date() };
    await this.call(() =>
      this.redis.set(this.key(task.id), serializeAnalysisTask(updated), 'EX', this.ttlSeconds),
    );
    return updated;
  }

  async get(taskId: string): Promise<AnalysisTask | null> {
    const raw = await this.call(() => this.redis.get(this.key(taskId)));
    return raw === null ? null : storedAnalysisTaskSchema.parse(JSON.parse(raw));
  }

  private key(taskId: string): string {
    return `${TaskRepository.KEY_PREFIX}${taskId}`;
  }

  private async call<T>(command: () => Promise<T>): Promise<T> {
    try {
      return await command();
    } catch (err) {
      throw new StorageUnavailableError({ cause: err });
    }
  }
}
