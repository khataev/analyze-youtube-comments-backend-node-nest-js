import { z } from 'zod';

/**
 * Категории — строки именно в таком виде отдаются в API.
 * `as const` + тип-объединение вместо `enum`: значения остаются обычными строками
 * (удобно для JSON и zod), а компилятор не даст опечататься.
 */
export const Category = {
  VideoSuggestion: 'Video suggestion',
  Questions: 'Questions',
  Thanks: 'Thanks',
  Advice: 'Advice/tips',
  Corrections: 'Corrections',
  Summaries: 'Summaries',
  Bots: 'Bots',
  Feedback: 'Feedback',
} as const;

export type Category = (typeof Category)[keyof typeof Category];

export const CATEGORIES = Object.values(Category) as [Category, ...Category[]];

export const categorySchema = z.enum(CATEGORIES);
