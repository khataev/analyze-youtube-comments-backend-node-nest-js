import { z } from 'zod';
import { categorySchema } from './category';
import { TaskStatus, taskStatusSchema } from './task-status';

const commentSchema = z.object({ id: z.string(), text: z.string() });

export const analysisResultSchema = z.partialRecord(categorySchema, z.array(commentSchema));

/** Комментарии, сгруппированные по категориям. Пустые категории отсутствуют. */
export type AnalysisResult = z.output<typeof analysisResultSchema>;

/** Доменная сущность задачи анализа. В API напрямую не отдаётся (см. dto/). */
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

/**
 * Формат хранения в Redis — тот же JSON в snake_case, что пишет Python-версия.
 * Поэтому обе реализации могут работать с одним Redis и читать задачи друг друга.
 */
export const storedAnalysisTaskSchema = z
  .object({
    task_id: z.uuid(),
    video_id: z.string(),
    status: taskStatusSchema,
    result: analysisResultSchema.nullable().default(null),
    error: z.string().nullable().default(null),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
  })
  .transform((raw): AnalysisTask => ({
    id: raw.task_id,
    videoId: raw.video_id,
    status: raw.status,
    result: raw.result,
    error: raw.error,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }));

export function serializeAnalysisTask(task: AnalysisTask): string {
  return JSON.stringify({
    task_id: task.id,
    video_id: task.videoId,
    status: task.status,
    result: task.result,
    error: task.error,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
  });
}
