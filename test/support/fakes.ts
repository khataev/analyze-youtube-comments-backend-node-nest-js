import type { Comment, CommentClassification } from '../../src/analysis/domain/comment';
import { Category } from '../../src/analysis/domain/category';
import type { CommentClassifier, CommentSource, TaskQueue } from '../../src/analysis/domain/ports';
import type { AnalysisTask } from '../../src/analysis/domain/analysis-task';

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

/** Замена TaskRepository (Redis) на Map — с тем же публичным интерфейсом. */
export class InMemoryTaskRepository {
  readonly tasks = new Map<string, AnalysisTask>();

  save(task: AnalysisTask): Promise<AnalysisTask> {
    const updated = { ...task, updatedAt: new Date() };
    this.tasks.set(task.id, updated);
    return Promise.resolve(updated);
  }

  get(taskId: string): Promise<AnalysisTask | null> {
    return Promise.resolve(this.tasks.get(taskId) ?? null);
  }
}

/** Клиент Redis для модулей, которые его внедряют (health, shutdown hook). */
export function fakeRedis(ping: () => Promise<string> = () => Promise.resolve('PONG')) {
  return { ping, status: 'end', disconnect: () => undefined, quit: () => Promise.resolve('OK') };
}
