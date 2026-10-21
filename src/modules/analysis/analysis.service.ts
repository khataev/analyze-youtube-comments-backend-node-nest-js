import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TaskNotFoundError } from './domain/errors';
import { TASK_QUEUE, type TaskQueue } from './domain/ports';
import { createAnalysisTask, type AnalysisTask } from './domain/analysis-task';
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

  async start(videoId: string): Promise<AnalysisTask> {
    const task = await this.repository.save(createAnalysisTask(randomUUID(), videoId));
    this.logger.log({ task_id: task.id, video_id: videoId }, 'Task created');

    try {
      await this.queue.enqueueAnalysis(task.id);
    } catch (err) {
      // Задача не попала в очередь: не оставляем её навсегда в pending
      await this.repository
        .save({ ...task, status: TaskStatus.Failed, error: 'Failed to enqueue task' })
        .catch(() => undefined);
      throw err;
    }
    return task;
  }

  async get(taskId: string): Promise<AnalysisTask> {
    const task = await this.repository.get(taskId);
    if (task === null) throw new TaskNotFoundError();
    return task;
  }
}
