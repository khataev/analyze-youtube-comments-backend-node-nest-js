import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { COMMENT_THREADS_URL, YoutubeClient } from '@/youtube/youtube.client';
import {
  CommentsUnavailableError,
  VideoNotFoundError,
  YoutubeRequestRejectedError,
  YoutubeUnavailableError,
} from '@/youtube/youtube.errors';
import { testConfig } from '@test/support/config';

/** msw перехватывает глобальный fetch — аналог respx для httpx. */
const server = setupServer();
beforeAll(() => {
  // Любой запрос без обработчика — ошибка теста, а не поход в настоящий YouTube
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function page(ids: string[], nextPageToken?: string) {
  return {
    nextPageToken,
    items: ids.map((id) => ({
      snippet: { topLevelComment: { id, snippet: { textOriginal: `text ${id}` } } },
    })),
  };
}

function client(maxComments = 200) {
  return new YoutubeClient(testConfig({ YOUTUBE_MAX_COMMENTS: String(maxComments) }));
}

describe('YoutubeClient', () => {
  it('follows pagination and sends the key in a header, not in the query', async () => {
    const requests: Request[] = [];
    server.use(
      http.get(COMMENT_THREADS_URL, ({ request }) => {
        requests.push(request);
        const token = new URL(request.url).searchParams.get('pageToken');
        return HttpResponse.json(token ? page(['c']) : page(['a', 'b'], 'next'));
      }),
    );

    const comments = await client().fetchComments('dQw4w9WgXcQ');

    expect(comments).toEqual([
      { id: 'a', text: 'text a' },
      { id: 'b', text: 'text b' },
      { id: 'c', text: 'text c' },
    ]);
    expect(requests).toHaveLength(2);
    const first = requests[0]!;
    expect(first.headers.get('x-goog-api-key')).toBe('test-key');
    const params = new URL(first.url).searchParams;
    expect(params.get('key')).toBeNull();
    expect(params.get('videoId')).toBe('dQw4w9WgXcQ');
    expect(params.get('maxResults')).toBe('100');
  });

  it('stops at YOUTUBE_MAX_COMMENTS', async () => {
    let calls = 0;
    server.use(
      http.get(COMMENT_THREADS_URL, () => {
        calls += 1;
        return HttpResponse.json(page(['a', 'b', 'c'], 'next'));
      }),
    );

    const comments = await client(2).fetchComments('dQw4w9WgXcQ');

    expect(comments.map((c) => c.id)).toEqual(['a', 'b']);
    expect(calls).toBe(1);
  });

  it.each([
    [404, VideoNotFoundError],
    [403, CommentsUnavailableError],
    [400, YoutubeRequestRejectedError],
  ])('maps %i to a permanent error without retries', async (status, errorClass) => {
    let calls = 0;
    server.use(
      http.get(COMMENT_THREADS_URL, () => {
        calls += 1;
        return new HttpResponse(null, { status });
      }),
    );

    const error = await client()
      .fetchComments('dQw4w9WgXcQ')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(errorClass);
    expect((error as YoutubeUnavailableError).retryable).toBe(false);
    expect(calls).toBe(1);
  });

  it('retries transient errors (5xx, 429, network) and then succeeds', async () => {
    const responses = [
      () => new HttpResponse(null, { status: 503 }),
      () => HttpResponse.error(),
      () => HttpResponse.json(page(['a'])),
    ];
    server.use(http.get(COMMENT_THREADS_URL, () => responses.shift()!()));

    const comments = await client().fetchComments('dQw4w9WgXcQ');

    expect(comments).toEqual([{ id: 'a', text: 'text a' }]);
    expect(responses).toHaveLength(0);
  });

  it('gives up after 3 attempts with a retryable error', async () => {
    let calls = 0;
    server.use(
      http.get(COMMENT_THREADS_URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 429 });
      }),
    );

    const error = await client()
      .fetchComments('dQw4w9WgXcQ')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(YoutubeUnavailableError);
    expect((error as YoutubeUnavailableError).retryable).toBe(true);
    expect(calls).toBe(3);
  });

  it('does not leak the API key into error messages', async () => {
    server.use(http.get(COMMENT_THREADS_URL, () => HttpResponse.error()));

    const error = (await client()
      .fetchComments('dQw4w9WgXcQ')
      .catch((e: unknown) => e)) as Error;

    expect(JSON.stringify({ message: error.message, cause: String(error.cause) })).not.toContain(
      'test-key',
    );
  });
});
