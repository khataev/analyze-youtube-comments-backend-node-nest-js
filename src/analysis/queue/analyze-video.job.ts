/** Контракт между API (кладёт задачу) и воркером (забирает). Обе стороны импортируют его отсюда. */
export const ANALYZE_VIDEO_JOB = 'analyze-video';

export interface AnalyzeVideoJobData {
  taskId: string;
}

export const ANALYZE_VIDEO_ATTEMPTS = 3;

/** Задача обрабатывается дольше — прерываем: обычно это зависший внешний вызов. */
export const ANALYZE_VIDEO_TIMEOUT_MS = 10 * 60_000;
