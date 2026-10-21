/** Контракт между API (кладёт задачу) и воркером (забирает). Обе стороны импортируют его отсюда. */
export const ANALYZE_VIDEO_JOB = 'analyze-video';

export interface AnalyzeVideoJobData {
  taskId: string;
}

export const ANALYZE_VIDEO_ATTEMPTS = 3;

/**
 * Сколько BullMQ хранит в Redis завершённые джобы. Это служебные данные очереди, а не задачи:
 * статус и результат лежат в Postgres бессрочно. Джоб нужен только для разбора проблем
 * (стек ошибки, число попыток), поэтому успешные храним недолго, а упавшие — неделю.
 * Лимит count важен: общий Redis работает с noeviction, и разросшаяся очередь одного backend
 * остановила бы запись у всех. Меняется редко, поэтому константа, а не переменная окружения.
 */
export const ANALYZE_VIDEO_KEEP_COMPLETED = { age: 60 * 60, count: 1_000 };
export const ANALYZE_VIDEO_KEEP_FAILED = { age: 7 * 24 * 60 * 60, count: 5_000 };

/** Задача обрабатывается дольше — прерываем: обычно это зависший внешний вызов. */
export const ANALYZE_VIDEO_TIMEOUT_MS = 10 * 60_000;
