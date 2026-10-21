import { DomainError, NotFoundError } from '@/common/errors/domain.error';

export class TaskNotFoundError extends NotFoundError {
  constructor() {
    super('Task not found');
  }
}

/** Задача не уложилась в отведённое время. Повторять бессмысленно. */
export class AnalysisTimeoutError extends DomainError {
  constructor() {
    super('Analysis timed out');
  }
}
