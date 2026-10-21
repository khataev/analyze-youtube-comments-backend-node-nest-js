import type { AnalysisResult } from './analysis-task';
import type { Comment, CommentClassification } from './comment';

/**
 * Склеивает ответ LLM с исходными комментариями.
 * Текст берётся из исходных данных, а не из ответа модели. Выдуманные моделью id и повторы
 * отбрасываются. Порядок категорий — по первому появлению.
 */
export function groupByCategory(
  comments: readonly Comment[],
  classifications: readonly CommentClassification[],
): AnalysisResult {
  const texts = new Map(comments.map((c) => [c.id, c.text]));
  const seen = new Set<string>();
  const result: AnalysisResult = {};

  for (const { id, category } of classifications) {
    const text = texts.get(id);
    if (text === undefined || seen.has(id)) continue;
    seen.add(id);
    (result[category] ??= []).push({ id, text });
  }
  return result;
}
