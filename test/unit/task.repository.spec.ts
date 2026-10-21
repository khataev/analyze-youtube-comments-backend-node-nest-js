import { describe, expect, it, vi } from 'vitest';
import { createAnalysisTask } from '../../src/analysis/domain/analysis-task';
import { TaskRepository } from '../../src/analysis/task.repository';
import { StorageUnavailableError } from '../../src/common/errors/domain.error';
import { testConfig } from '../support/config';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

function repositoryWith(redis: object) {
  return new TaskRepository(redis as never, testConfig({ TASK_TTL_SECONDS: '60' }));
}

describe('TaskRepository', () => {
  it('stores a snake_case JSON task under analysis:task:<id> with TTL', async () => {
    const redis = { set: vi.fn().mockResolvedValue('OK') };

    await repositoryWith(redis).save(createAnalysisTask(TASK_ID, 'dQw4w9WgXcQ'));

    expect(redis.set).toHaveBeenCalledWith(
      `analysis:task:${TASK_ID}`,
      expect.any(String),
      'EX',
      60,
    );
    const stored = JSON.parse(redis.set.mock.calls[0]![1] as string);
    expect(stored).toMatchObject({
      task_id: TASK_ID,
      video_id: 'dQw4w9WgXcQ',
      status: 'pending',
      result: null,
      error: null,
    });
  });

  it('reads a task written by the Python version', async () => {
    const pythonTask = JSON.stringify({
      task_id: TASK_ID,
      video_id: 'dQw4w9WgXcQ',
      status: 'completed',
      result: { Thanks: [{ id: 'a', text: 'Thanks!' }] },
      error: null,
      created_at: '2026-10-16T10:00:00.123456Z',
      updated_at: '2026-10-16T10:00:05.654321+00:00',
    });
    const redis = { get: vi.fn().mockResolvedValue(pythonTask) };

    const task = await repositoryWith(redis).get(TASK_ID);

    expect(task).toMatchObject({
      id: TASK_ID,
      status: 'completed',
      result: { Thanks: [{ id: 'a', text: 'Thanks!' }] },
    });
    expect(task?.updatedAt).toBeInstanceOf(Date);
  });

  it('returns null for a missing key', async () => {
    const redis = { get: vi.fn().mockResolvedValue(null) };
    await expect(repositoryWith(redis).get(TASK_ID)).resolves.toBeNull();
  });

  it('turns connection errors into StorageUnavailableError', async () => {
    const redis = { get: vi.fn().mockRejectedValue(new Error("Stream isn't writeable")) };
    await expect(repositoryWith(redis).get(TASK_ID)).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
  });
});
