import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../common/errors/domain.error';
import { AnalysisTimeoutError } from './domain/errors';
import { groupByCategory } from './domain/group-by-category';
import {
  COMMENT_CLASSIFIER,
  COMMENT_SOURCE,
  type CommentClassifier,
  type CommentSource,
} from './domain/ports';
import type { AnalysisTask } from './domain/analysis-task';
import { isFinished, TaskStatus } from './domain/task-status';
import { TaskRepository } from './task.repository';

export interface RunOptions {
  /** Будут ли ещё попытки, если эта упадёт с временной ошибкой. */
  isFinalAttempt: boolean;
  attempt?: number;
  signal?: AbortSignal;
}

/**
 * Задача завершена со статусом failed, повторять её не нужно.
 * Процессор очереди превращает это в UnrecoverableError BullMQ.
 */
export class TaskFailedError extends Error {}

/**
 * Сторона воркера: сама обработка задачи. Про очередь не знает — её вызывает процессор.
 *
 * Контракт run():
 *   - вернулся нормально → задача завершена (completed, failed с постоянной ошибкой или пропущена);
 *   - TaskFailedError → задача помечена failed, повторы не нужны;
 *   - любая другая ошибка → временный сбой, задача возвращена в pending, очередь повторит её.
 * Последняя попытка всегда заканчивается финальным статусом: задача не зависает в processing.
 */
@Injectable()
export class CommentAnalyzer {
  private readonly logger = new Logger(CommentAnalyzer.name);

  constructor(
    private readonly repository: TaskRepository,
    @Inject(COMMENT_SOURCE) private readonly source: CommentSource,
    @Inject(COMMENT_CLASSIFIER) private readonly classifier: CommentClassifier,
  ) {}

  async run(taskId: string, options: RunOptions): Promise<void> {
    const found = await this.repository.get(taskId);
    if (found === null) {
      this.logger.warn('Task not found, skipping');
      return;
    }
    if (isFinished(found.status)) {
      // Повторная доставка уже обработанной задачи (например, после падения воркера)
      this.logger.log(`Task is already ${found.status}, skipping`);
      return;
    }

    const task = await this.repository.save({
      ...found,
      status: TaskStatus.Processing,
      error: null,
    });
    this.logger.log({ video_id: task.videoId, attempt: options.attempt }, 'Processing video');
    const started = performance.now();

    try {
      this.logger.log('Step 1/3: fetching comments from YouTube');
      const comments = await this.source.fetchComments(task.videoId, options);
      this.logger.log({ comments: comments.length }, 'Fetched comments');

      this.logger.log('Step 2/3: classifying with LLM');
      const classifications =
        comments.length > 0 ? await this.classifier.classify(comments, options) : [];
      this.logger.log({ classifications: classifications.length }, 'LLM classification finished');

      this.logger.log('Step 3/3: saving result');
      const result = groupByCategory(comments, classifications);
      await this.repository.save({ ...task, status: TaskStatus.Completed, result });

      const counts = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length]));
      this.logger.log({ duration_s: seconds(started), counts }, 'Completed');
    } catch (err) {
      await this.handleFailure(task, this.normalize(err, options.signal), options);
    }
  }

  /** Страховка на случай, когда задача упала вне run() (например, зависла и исчерпала лимит). */
  async markFailedIfUnfinished(taskId: string, error: string): Promise<void> {
    const task = await this.repository.get(taskId);
    if (task === null || isFinished(task.status)) return;
    await this.repository.save({ ...task, status: TaskStatus.Failed, error });
    this.logger.warn({ error }, 'Marked as failed by queue');
  }

  private async handleFailure(task: AnalysisTask, err: unknown, options: RunOptions) {
    if (err instanceof DomainError && !err.retryable) {
      this.logger.warn({ error: err.message }, 'Failed');
      await this.fail(task, err.message);
      throw new TaskFailedError(err.message, { cause: err });
    }

    if (options.isFinalAttempt) {
      this.logger.error({ err }, 'Failed on the final attempt');
      // Сообщения доменных ошибок показываются пользователю, остальное — внутренние детали
      const message = err instanceof DomainError ? err.message : 'Internal error';
      await this.fail(task, message);
      throw new TaskFailedError(message, { cause: err });
    }

    this.logger.warn({ err }, 'Attempt failed, will be retried');
    await this.repository.save({ ...task, status: TaskStatus.Pending });
    throw err;
  }

  private async fail(task: AnalysisTask, error: string): Promise<void> {
    await this.repository.save({ ...task, status: TaskStatus.Failed, result: null, error });
  }

  private normalize(err: unknown, signal: AbortSignal | undefined): unknown {
    const reason: unknown = signal?.reason;
    if (signal?.aborted && reason instanceof Error && reason.name === 'TimeoutError') {
      return new AnalysisTimeoutError();
    }
    return err;
  }
}

function seconds(startedMs: number): number {
  return Math.round(performance.now() - startedMs) / 1000;
}
