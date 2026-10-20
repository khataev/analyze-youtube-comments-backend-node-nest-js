import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TaskNotFoundError } from './domain/errors';
import { TASK_QUEUE, type TaskQueue } from './domain/ports';
import { newTaskRecord, type TaskRecord } from './domain/task-record';
import { TaskStatus } from './domain/task-status';
import { TaskRepository } from './task.repository';

/**
 * Сторона API: поставить задачу и узнать её статус. Ничего не знает про HTTP и Redis.
 *
 * @Injectable() делает класс провайдером: Nest сам создаст его один раз и передаст
 * зависимости в конструктор. Классы внедряются по типу, интерфейсы — по токену (@Inject).
 */
@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly repository: TaskRepository,
    @Inject(TASK_QUEUE) private readonly queue: TaskQueue,
  ) {}

  async start(videoId: string): Promise<TaskRecord> {
    const record = await this.repository.save(newTaskRecord(randomUUID(), videoId));
    this.logger.log({ task_id: record.taskId, video_id: videoId }, 'Task created');

    try {
      await this.queue.enqueueAnalysis(record.taskId);
    } catch (err) {
      // Задача не попала в очередь: не оставляем её навсегда в pending
      await this.repository
        .save({ ...record, status: TaskStatus.Failed, error: 'Failed to enqueue task' })
        .catch(() => undefined);
      throw err;
    }
    return record;
  }

  async get(taskId: string): Promise<TaskRecord> {
    const record = await this.repository.get(taskId);
    if (record === null) throw new TaskNotFoundError();
    return record;
  }
}
