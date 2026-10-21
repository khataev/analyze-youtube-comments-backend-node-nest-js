import type { Comment, CommentClassification } from '@/modules/analysis/domain/comment';
import { Category } from '@/modules/analysis/domain/category';
import type { CommentClassifier, CommentSource, TaskQueue } from '@/modules/analysis/domain/ports';

/*
 * Фейки портов: простые классы вместо моков, как в Python-версии.
 * Подставляются через overrideProvider(TOKEN).useValue(fake).
 */

export class FakeQueue implements TaskQueue {
  readonly enqueued: string[] = [];

  enqueueAnalysis(taskId: string): Promise<void> {
    this.enqueued.push(taskId);
    return Promise.resolve();
  }
}

export class FakeSource implements CommentSource {
  constructor(
    public comments: Comment[] = [],
    public error?: Error,
  ) {}

  fetchComments(): Promise<Comment[]> {
    return this.error ? Promise.reject(this.error) : Promise.resolve(this.comments);
  }
}

/** Относит все комментарии к одной категории. */
export class FakeClassifier implements CommentClassifier {
  constructor(public category: Category = Category.Thanks) {}

  classify(comments: readonly Comment[]): Promise<CommentClassification[]> {
    return Promise.resolve(
      comments.map((c) => ({ id: c.id, category: this.category, reasoning: 'test' })),
    );
  }
}

/** Клиент Redis для модулей, которые его внедряют (health, shutdown hook). Очередь мокается отдельно. */
export function fakeRedis(ping: () => Promise<string> = () => Promise.resolve('PONG')) {
  return { ping, status: 'end', disconnect: () => undefined, quit: () => Promise.resolve('OK') };
}
