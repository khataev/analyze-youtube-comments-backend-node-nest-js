import { DomainError } from '../common/errors/domain.error';

/** Сообщения этих ошибок показываются пользователю в поле `error` задачи. */
export class YoutubeError extends DomainError {}

export class VideoNotFoundError extends YoutubeError {
  constructor() {
    super('Video not found');
  }
}

export class CommentsUnavailableError extends YoutubeError {
  constructor() {
    super('Comments are disabled for this video or API quota is exceeded');
  }
}

export class YoutubeRequestRejectedError extends YoutubeError {
  constructor(status: number) {
    super(`YouTube API rejected the request (${status})`);
  }
}

/** Сеть, таймаут, 5xx, 429: клиент уже повторял запрос, задачу можно повторить позже. */
export class YoutubeUnavailableError extends YoutubeError {
  override readonly retryable = true;

  constructor(options?: ErrorOptions) {
    super('YouTube API is temporarily unavailable', options);
  }
}
