import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CommentAnalyzer } from '@/analysis/comment-analyzer.service';
import { Category } from '@/analysis/domain/category';
import { COMMENT_CLASSIFIER, COMMENT_SOURCE } from '@/analysis/domain/ports';
import { AnalysisProcessor } from '@/analysis/queue/analysis.processor';
import type { AnalyzeVideoJobData } from '@/analysis/queue/analyze-video.job';
import { TaskRepository } from '@/analysis/task.repository';
import { appConfig } from '@/config/app.config';
import { createApiApp } from '@test/support/api-app';
import { useTestDatabase } from '@test/support/database';
import { testConfig } from '@test/support/config';
import { FakeClassifier, FakeSource } from '@test/support/fakes';
import { silentLoggerModule } from '@test/support/logging';

/**
 * Путь «API → очередь → процессор» без Redis, хранилище — тестовая база Postgres. Связующее звено — аргументы queue.add():
 * берём ровно то, что API положил в очередь, собираем из этого Job и отдаём процессору воркера.
 * Так проверяется контракт продюсера и консьюмера (имя job, форма данных, опции),
 * а поведение самого BullMQ — забота библиотеки.
 */
describe('API → queue → processor', () => {
  const db = useTestDatabase();

  it('processes a task created via HTTP up to the completed status', async () => {
    const { app, queue } = await createApiApp({ db: db() });
    const http = request(app.getHttpServer());

    // 1. API: создаём задачу
    const created = await http
      .post('/api/v1/analysis')
      .send({ url: 'https://youtu.be/dQw4w9WgXcQ' })
      .expect(202);
    const taskId = (created.body as { task_id: string }).task_id;
    await http.get(`/api/v1/analysis/${taskId}`).expect(200, {
      task_id: taskId,
      status: 'pending',
      result: null,
      error: null,
    });

    // 2. Очередь: что именно API поставил
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0] as [string, AnalyzeVideoJobData, object];

    // 3. Воркер: процессор с теми же провайдерами, что в AnalysisModule.forWorker(),
    //    внешние клиенты — фейки, база общая с API (та же транзакция теста)
    const worker = await Test.createTestingModule({
      imports: [silentLoggerModule()],
      providers: [
        AnalysisProcessor,
        CommentAnalyzer,
        { provide: TaskRepository, useValue: new TaskRepository(db()) },
        { provide: appConfig.KEY, useValue: testConfig() },
        {
          provide: COMMENT_SOURCE,
          useValue: new FakeSource([
            { id: 'a', text: 'Thanks!' },
            { id: 'b', text: 'Thank you so much' },
          ]),
        },
        { provide: COMMENT_CLASSIFIER, useValue: new FakeClassifier(Category.Thanks) },
      ],
    }).compile();

    const job = {
      id: taskId,
      name,
      data,
      opts,
      attemptsMade: 0,
    } as unknown as Job<AnalyzeVideoJobData>;
    await worker.get(AnalysisProcessor).process(job);

    // 4. API: клиент видит результат
    await http.get(`/api/v1/analysis/${taskId}`).expect(200, {
      task_id: taskId,
      status: 'completed',
      result: {
        Thanks: [
          { id: 'a', text: 'Thanks!' },
          { id: 'b', text: 'Thank you so much' },
        ],
      },
      error: null,
    });

    await app.close();
  });
});
