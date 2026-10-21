import type { Category } from './category';
import type { Comment } from './comment';
import { TaskStatus } from './task-status';

/** Комментарии, сгруппированные по категориям. Пустые категории отсутствуют. */
export type AnalysisResult = Partial<Record<Category, Comment[]>>;

/**
 * Доменная сущность задачи анализа. О базе не знает (модель хранения — analysis-task.table.ts),
 * в API напрямую не отдаётся (см. dto/).
 */
export interface AnalysisTask {
  id: string;
  videoId: string;
  status: TaskStatus;
  result: AnalysisResult | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createAnalysisTask(id: string, videoId: string): AnalysisTask {
  const now = new Date();
  return {
    id,
    videoId,
    status: TaskStatus.Pending,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}
