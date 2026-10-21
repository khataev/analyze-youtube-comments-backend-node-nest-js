import { z } from 'zod';
import { categorySchema } from './category';

export interface Comment {
  id: string;
  text: string;
}

/**
 * Структурированный ответ LLM для одного комментария. Схема одновременно:
 * задаёт формат ответа модели (AI SDK превращает её в JSON Schema) и валидирует его.
 */
export const commentClassificationSchema = z.object({
  id: z.string().describe('Comment id from the input, unchanged'),
  category: categorySchema,
  reasoning: z.string().describe('Short explanation of the chosen category'),
});

export type CommentClassification = z.output<typeof commentClassificationSchema>;
