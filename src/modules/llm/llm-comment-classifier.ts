import { Inject, Injectable, Logger } from '@nestjs/common';
import { APICallError, generateText, type LanguageModel, NoObjectGeneratedError, Output } from 'ai';
import pLimit from 'p-limit';
import { z } from 'zod';
import {
  type Comment,
  type CommentClassification,
  commentClassificationSchema,
} from '@/modules/analysis/domain/comment';
import type { CallOptions, CommentClassifier } from '@/modules/analysis/domain/ports';
import { type AppConfig, appConfig } from '@/core/config/app.config';
import { LANGUAGE_MODEL } from './language-model.factory';
import { LlmError } from './llm.errors';
import { INSTRUCTIONS } from './prompt';

/** Корень ответа — объект: structured output у части провайдеров не принимает массив. */
const outputSchema = z.object({ items: z.array(commentClassificationSchema) });

/**
 * Классификатор на Vercel AI SDK. Формат ответа задаёт zod-схема (Output.object):
 * SDK передаёт модели JSON Schema и валидирует ответ — промпт формат не описывает.
 *
 * Комментарии режутся на батчи по LLM_BATCH_SIZE, батчи идут параллельно,
 * но не больше LLM_CONCURRENCY одновременно (p-limit) — чтобы не упереться в rate limit.
 */
@Injectable()
export class LlmCommentClassifier implements CommentClassifier {
  private readonly logger = new Logger(LlmCommentClassifier.name);

  constructor(
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModel,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  async classify(
    comments: readonly Comment[],
    options: CallOptions = {},
  ): Promise<CommentClassification[]> {
    const { batchSize, concurrency } = this.config.llm;
    const batches = chunk(comments, batchSize);
    this.logger.log(
      { comments: comments.length, batches: batches.length, batch_size: batchSize, concurrency },
      'LLM classification started',
    );

    // Первая ошибка отменяет остальные батчи: результат задачи всё равно уже не собрать
    const failFast = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, failFast.signal])
      : failFast.signal;
    const limit = pLimit(concurrency);

    try {
      const results = await Promise.all(
        batches.map((batch, i) =>
          limit(() => this.classifyBatch(batch, i + 1, batches.length, signal)),
        ),
      );
      return results.flat();
    } catch (err) {
      failFast.abort();
      throw err;
    }
  }

  private async classifyBatch(
    batch: readonly Comment[],
    number: number,
    total: number,
    signal: AbortSignal,
  ): Promise<CommentClassification[]> {
    const started = performance.now();
    try {
      const { output, usage } = await generateText({
        model: this.model,
        system: INSTRUCTIONS,
        // JSON, а не текст в разметке: текст комментария экранируется автоматически
        prompt: JSON.stringify(batch.map(({ id, text }) => ({ id, text }))),
        output: Output.object({ schema: outputSchema, name: 'classifications' }),
        abortSignal: signal,
        maxRetries: 2,
      });
      this.logger.log(
        {
          batch: `${number}/${total}`,
          comments: batch.length,
          items: output.items.length,
          duration_s: Math.round(performance.now() - started) / 1000,
          tokens_in: usage.inputTokens,
          tokens_out: usage.outputTokens,
        },
        'LLM batch done',
      );
      return output.items;
    } catch (err) {
      throw toLlmError(err);
    }
  }
}

function toLlmError(err: unknown): unknown {
  if (APICallError.isInstance(err)) {
    return err.isRetryable
      ? new LlmError('LLM provider is temporarily unavailable', true, { cause: err })
      : new LlmError('LLM provider rejected the request', false, { cause: err });
  }
  if (NoObjectGeneratedError.isInstance(err)) {
    return new LlmError('LLM returned an invalid response', true, { cause: err });
  }
  return err;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
