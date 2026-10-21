import type { AnalysisTask } from '../domain/analysis-task';
import type { Category } from '../domain/category';
import type { TaskStatus } from '../domain/task-status';

/*
 * Ответы API. Поля в snake_case — это контракт с общим фронтендом (как в Python-версии),
 * внутри кода модели в camelCase. Отдельные классы ответа не дают случайно отдать наружу
 * внутренние поля задачи (video_id, даты).
 *
 * Все типы, уходящие наружу, оканчиваются на Response, включая вложенные. Суффикс Schema,
 * как у Python-версии (CommentSchema), не используем: в zod-коде он означает zod-схему.
 */

export class TaskCreatedResponse {
  constructor(readonly task_id: string) {}
}

/** Комментарий внутри `result` ответа. */
export class CommentResponse {
  constructor(
    readonly id: string,
    readonly text: string,
  ) {}
}

export type AnalysisResultResponse = Partial<Record<Category, CommentResponse[]>>;

export class TaskStatusResponse {
  constructor(
    readonly task_id: string,
    readonly status: TaskStatus,
    readonly result: AnalysisResultResponse | null,
    readonly error: string | null,
  ) {}

  static fromTask(task: AnalysisTask): TaskStatusResponse {
    const result =
      task.result === null
        ? null
        : Object.fromEntries(
            Object.entries(task.result).map(([category, comments]) => [
              category,
              comments.map((c) => new CommentResponse(c.id, c.text)),
            ]),
          );
    return new TaskStatusResponse(task.id, task.status, result, task.error);
  }
}
