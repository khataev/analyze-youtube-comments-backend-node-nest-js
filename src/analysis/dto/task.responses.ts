import type { AnalysisResult, TaskRecord } from '../domain/task-record';
import type { TaskStatus } from '../domain/task-status';

/*
 * Ответы API. Поля в snake_case — это контракт с общим фронтендом (как в Python-версии),
 * внутри кода модели в camelCase. Отдельные классы ответа не дают случайно отдать наружу
 * внутренние поля записи (video_id, даты).
 */

export class TaskCreatedResponse {
  constructor(readonly task_id: string) {}
}

export class TaskStatusResponse {
  constructor(
    readonly task_id: string,
    readonly status: TaskStatus,
    readonly result: AnalysisResult | null,
    readonly error: string | null,
  ) {}

  static fromRecord(record: TaskRecord): TaskStatusResponse {
    return new TaskStatusResponse(record.taskId, record.status, record.result, record.error);
  }
}
