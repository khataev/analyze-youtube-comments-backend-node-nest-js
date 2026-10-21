import type { z } from 'zod';

/**
 * Превращает zod-схему в класс-DTO. Класс нужен Nest: TypeScript-типы стираются при компиляции,
 * а класс остаётся в рантайме и попадает в метаданные параметра (`@Body() body: AnalyzeRequest`).
 * По этому классу ZodValidationPipe находит схему. Так же устроен createZodDto из nestjs-zod
 * (сам пакет пока не поддерживает Nest 12).
 *
 * Результат — аналог pydantic-модели: схема валидации и тип в одном месте.
 */
export interface ZodDto<TSchema extends z.ZodType> {
  new (): z.output<TSchema>;
  readonly schema: TSchema;
}

export function createZodDto<TSchema extends z.ZodType>(schema: TSchema): ZodDto<TSchema> {
  class Dto {
    static readonly schema = schema;
  }
  return Dto as unknown as ZodDto<TSchema>;
}

export function isZodDto(metatype: unknown): metatype is ZodDto<z.ZodType> {
  return typeof metatype === 'function' && 'schema' in metatype;
}
