import type { Comment, CommentClassification } from './comment';

/**
 * Порты — то, что нужно сервисам анализа от внешнего мира, без привязки к реализации.
 * Аналог Protocol из Python-версии.
 *
 * Интерфейсы TypeScript стираются при компиляции, поэтому DI Nest не может найти
 * реализацию по типу (как по классу). Для этого нужны injection-токены: `@Inject(TASK_QUEUE)`.
 * Реализации регистрируются в модулях (`{ provide: TASK_QUEUE, useClass: BullMqTaskQueue }`),
 * а в тестах подменяются через `overrideProvider(TASK_QUEUE)`.
 */

export const TASK_QUEUE = Symbol('TASK_QUEUE');
export const COMMENT_SOURCE = Symbol('COMMENT_SOURCE');
export const COMMENT_CLASSIFIER = Symbol('COMMENT_CLASSIFIER');

export interface CallOptions {
  /** Отмена по таймауту задачи или при остановке воркера. */
  signal?: AbortSignal;
}

export interface TaskQueue {
  enqueueAnalysis(taskId: string): Promise<void>;
}

export interface CommentSource {
  fetchComments(videoId: string, options?: CallOptions): Promise<Comment[]>;
}

export interface CommentClassifier {
  classify(comments: readonly Comment[], options?: CallOptions): Promise<CommentClassification[]>;
}
