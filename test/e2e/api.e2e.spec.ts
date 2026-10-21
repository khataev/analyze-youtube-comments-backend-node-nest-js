import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Category } from '../../src/analysis/domain/category';
import { createAnalysisTask } from '../../src/analysis/domain/analysis-task';
import { TaskStatus } from '../../src/analysis/domain/task-status';
import { TaskRepository } from '../../src/analysis/task.repository';
import { createApiApp } from '../support/api-app';
import { unreachableDatabase, useTestDatabase } from '../support/database';
import { fakeRedis } from '../support/fakes';

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('HTTP API', () => {
  const db = useTestDatabase();
  let app: INestApplication;
  let repository: TaskRepository;
  let queue: Awaited<ReturnType<typeof createApiApp>>['queue'];

  beforeEach(async () => {
    ({ app, queue } = await createApiApp({ db: db() }));
    repository = new TaskRepository(db());
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /api/v1/analysis', () => {
    it('creates a task, enqueues it and returns 202 with task_id', async () => {
      const response = await http().post('/api/v1/analysis').send({ url: VIDEO_URL }).expect(202);

      const taskId = (response.body as { task_id: string }).task_id;
      expect(response.body).toEqual({ task_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
      expect(queue.add).toHaveBeenCalledWith(
        'analyze-video',
        { taskId },
        expect.objectContaining({ jobId: taskId }),
      );
      expect(await repository.get(taskId)).toMatchObject({
        videoId: 'dQw4w9WgXcQ',
        status: TaskStatus.Pending,
      });
    });

    it.each([
      ['a non-YouTube link', { url: 'https://vimeo.com/123' }],
      ['a malformed URL', { url: 'not a url' }],
      ['a YouTube link without video id', { url: 'https://www.youtube.com/feed' }],
      ['a missing url', {}],
    ])('returns 422 for %s', async (_, body) => {
      const response = await http().post('/api/v1/analysis').send(body).expect(422);

      expect(response.body).toEqual({
        detail: [expect.objectContaining({ loc: ['body', 'url'], msg: expect.any(String) })],
      });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('returns 503 without internal details when the queue is unavailable', async () => {
      queue.add.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

      const response = await http().post('/api/v1/analysis').send({ url: VIDEO_URL }).expect(503);

      expect(response.body).toEqual({ detail: 'Storage is unavailable' });
    });
  });

  describe('GET /api/v1/analysis/:taskId', () => {
    it('returns the task in snake_case', async () => {
      const task = createAnalysisTask('11111111-1111-4111-8111-111111111111', 'dQw4w9WgXcQ');
      await repository.save({
        ...task,
        status: TaskStatus.Completed,
        result: { [Category.Thanks]: [{ id: 'a', text: 'Thanks!' }] },
      });

      const response = await http().get(`/api/v1/analysis/${task.id}`).expect(200);

      expect(response.body).toEqual({
        task_id: task.id,
        status: 'completed',
        result: { Thanks: [{ id: 'a', text: 'Thanks!' }] },
        error: null,
      });
    });

    it('returns 404 for an unknown task', async () => {
      const response = await http().get(`/api/v1/analysis/${UNKNOWN_ID}`).expect(404);
      expect(response.body).toEqual({ detail: 'Task not found' });
    });

    it('returns 422 for a malformed task id', async () => {
      await http().get('/api/v1/analysis/not-a-uuid').expect(422);
    });
  });

  describe('GET /health', () => {
    it('returns 200 when Postgres and Redis answer', async () => {
      const response = await http().get('/health').expect(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        info: { postgres: { status: 'up' }, redis: { status: 'up' } },
      });
    });
  });
});

describe('HTTP API with Redis down', () => {
  const db = useTestDatabase();

  it('GET /health returns 503', async () => {
    const { app } = await createApiApp({
      db: db(),
      redis: fakeRedis(() => Promise.reject(new Error('ECONNREFUSED'))),
    });

    const response = await request(app.getHttpServer()).get('/health').expect(503);

    expect(response.body).toMatchObject({ status: 'error', error: { redis: { status: 'down' } } });
    await app.close();
  });
});

describe('HTTP API with Postgres down', () => {
  const unreachable = unreachableDatabase();
  let app: INestApplication;

  beforeEach(async () => {
    ({ app } = await createApiApp({ db: unreachable.db, pool: unreachable.pool }));
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => unreachable.pool.end());

  it('returns 503 without internal details', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/analysis/${UNKNOWN_ID}`)
      .expect(503);

    expect(response.body).toEqual({ detail: 'Storage is unavailable' });
  });

  it('GET /health returns 503', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(503);

    expect(response.body).toMatchObject({ error: { postgres: { status: 'down' } } });
  });
});
