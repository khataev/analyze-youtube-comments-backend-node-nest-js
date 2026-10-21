import { Inject, Injectable, Logger } from '@nestjs/common';
import pRetry from 'p-retry';
import { z } from 'zod';
import type { Comment } from '@/modules/analysis/domain/comment';
import type { CallOptions, CommentSource } from '@/modules/analysis/domain/ports';
import { type AppConfig, appConfig } from '@/core/config/app.config';
import {
  CommentsUnavailableError,
  VideoNotFoundError,
  YoutubeRequestRejectedError,
  YoutubeUnavailableError,
} from './youtube.errors';

export const COMMENT_THREADS_URL = 'https://www.googleapis.com/youtube/v3/commentThreads';
const PAGE_SIZE = 100; // максимум, который разрешает API
const REQUEST_TIMEOUT_MS = 10_000;

/** Проверяем только то, что используем: остальные поля ответа API нам не важны. */
const pageSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z
    .array(
      z.object({
        snippet: z.object({
          topLevelComment: z.object({
            id: z.string(),
            snippet: z.object({ textOriginal: z.string() }),
          }),
        }),
      }),
    )
    .default([]),
});

/**
 * Клиент YouTube Data API, реализация порта CommentSource.
 * Пагинация до YOUTUBE_MAX_COMMENTS; повторы с экспоненциальной паузой только для
 * временных ошибок; таймаут на каждый запрос.
 */
@Injectable()
export class YoutubeClient implements CommentSource {
  private readonly logger = new Logger(YoutubeClient.name);

  constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {}

  async fetchComments(videoId: string, options: CallOptions = {}): Promise<Comment[]> {
    const { maxComments } = this.config.youtube;
    const comments: Comment[] = [];
    let pageToken: string | undefined;

    do {
      const page = await this.fetchPage(videoId, pageToken, options.signal);
      for (const { snippet } of page.items) {
        const top = snippet.topLevelComment;
        comments.push({ id: top.id, text: top.snippet.textOriginal });
      }
      pageToken = page.nextPageToken;
      this.logger.debug({ total: comments.length, has_more: Boolean(pageToken) }, 'Fetched page');
    } while (pageToken && comments.length < maxComments);

    return comments.slice(0, maxComments);
  }

  private fetchPage(videoId: string, pageToken: string | undefined, signal?: AbortSignal) {
    return pRetry(() => this.requestPage(videoId, pageToken, signal), {
      retries: 2,
      minTimeout: 500,
      maxTimeout: 5_000,
      signal,
      shouldRetry: ({ error }) => error instanceof YoutubeUnavailableError,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        if (retriesLeft > 0 && error instanceof YoutubeUnavailableError) {
          this.logger.warn(
            { attempt: attemptNumber, cause: describe(error.cause) },
            'YouTube request failed, retrying',
          );
        }
      },
    });
  }

  private async requestPage(videoId: string, pageToken: string | undefined, signal?: AbortSignal) {
    const url = new URL(COMMENT_THREADS_URL);
    url.search = new URLSearchParams({
      part: 'snippet',
      videoId,
      maxResults: String(PAGE_SIZE),
      textFormat: 'plainText',
      ...(pageToken ? { pageToken } : {}),
    }).toString();

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        // Ключ в заголовке, а не в query: иначе он попадёт в логи и тексты ошибок
        headers: { 'X-Goog-Api-Key': this.config.youtube.apiKey },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (err) {
      if (signal?.aborted) throw err; // задачу отменили — не повторяем
      throw new YoutubeUnavailableError({ cause: err }); // сеть или таймаут запроса
    }

    if (response.ok) return pageSchema.parse(await response.json());

    const { status } = response;
    if (status === 404) throw new VideoNotFoundError();
    if (status === 403) throw new CommentsUnavailableError();
    if (status === 429 || status >= 500) {
      throw new YoutubeUnavailableError({ cause: new Error(`HTTP ${status}`) });
    }
    throw new YoutubeRequestRejectedError(status);
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
