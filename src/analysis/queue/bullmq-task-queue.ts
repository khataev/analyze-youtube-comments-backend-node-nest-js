import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { StorageUnavailableError } from '../../common/errors/domain.error';
import { type AppConfig, appConfig } from '../../config/app.config';
import { ANALYSIS_QUEUE } from '../../queue/queue.constants';
import type { TaskQueue } from '../domain/ports';
import {
  ANALYZE_VIDEO_ATTEMPTS,
  ANALYZE_VIDEO_JOB,
  type AnalyzeVideoJobData,
} from './analyze-video.job';

/** Реализация порта TaskQueue поверх BullMQ. Аналог `SomeJob.perform_async` в Sidekiq. */
@Injectable()
export class BullMqTaskQueue implements TaskQueue {
  private readonly logger = new Logger(BullMqTaskQueue.name);

  constructor(
    @InjectQueue(ANALYSIS_QUEUE) private readonly queue: Queue<AnalyzeVideoJobData>,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  async enqueueAnalysis(taskId: string): Promise<void> {
    const ttlSeconds = this.config.tasks.ttlSeconds;
    try {
      await this.queue.add(
        ANALYZE_VIDEO_JOB,
        { taskId },
        {
          // id задачи = id job: повторная постановка той же задачи не создаст дубль
          jobId: taskId,
          attempts: ANALYZE_VIDEO_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5_000 },
          // Служебные данные BullMQ живут не дольше статуса задачи
          removeOnComplete: { age: ttlSeconds },
          removeOnFail: { age: ttlSeconds },
        },
      );
    } catch (err) {
      throw new StorageUnavailableError({ cause: err });
    }
    // Нет «Received by worker» в логах воркера после этой строки — воркер не слушает очередь
    this.logger.log({ task_id: taskId, queue: ANALYSIS_QUEUE }, 'Task enqueued');
  }
}
