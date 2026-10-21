import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnalysisService } from '../../src/analysis/analysis.service';
import { TaskNotFoundError } from '../../src/analysis/domain/errors';
import { TASK_QUEUE } from '../../src/analysis/domain/ports';
import { TaskStatus } from '../../src/analysis/domain/task-status';
import { TaskRepository } from '../../src/analysis/task.repository';
import { StorageUnavailableError } from '../../src/common/errors/domain.error';
import { analysisTasksTable } from '../../src/analysis/analysis-task.table';
import { FakeQueue } from '../support/fakes';
import { useTestDatabase } from '../support/database';

describe('AnalysisService', () => {
  const db = useTestDatabase();
  let service: AnalysisService;
  let repository: TaskRepository;
  let queue: FakeQueue;

  beforeEach(async () => {
    repository = new TaskRepository(db());
    queue = new FakeQueue();
    // Тестовый модуль Nest: собираем только сервис, зависимости — фейки
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: TaskRepository, useValue: repository },
        { provide: TASK_QUEUE, useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(AnalysisService);
  });

  it('saves a pending task and puts it into the queue', async () => {
    const task = await service.start('dQw4w9WgXcQ');

    expect(task.status).toBe(TaskStatus.Pending);
    expect(task.videoId).toBe('dQw4w9WgXcQ');
    expect(queue.enqueued).toEqual([task.id]);
    expect(await repository.get(task.id)).toMatchObject({ status: TaskStatus.Pending });
  });

  it('marks the task as failed if it could not be enqueued', async () => {
    queue.enqueueAnalysis = () => Promise.reject(new StorageUnavailableError());

    await expect(service.start('dQw4w9WgXcQ')).rejects.toBeInstanceOf(StorageUnavailableError);

    const [stored] = await db().select().from(analysisTasksTable);
    expect(stored).toMatchObject({ status: TaskStatus.Failed, error: 'Failed to enqueue task' });
  });

  it('returns a stored task', async () => {
    const { id } = await service.start('dQw4w9WgXcQ');

    await expect(service.get(id)).resolves.toMatchObject({ id });
  });

  it('throws a domain error for an unknown task', async () => {
    await expect(service.get('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });
});
