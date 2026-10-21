import { afterAll, describe, expect, it } from 'vitest';
import { analysisTasksTable } from '../../src/analysis/analysis-task.table';
import { createAnalysisTask } from '../../src/analysis/domain/analysis-task';
import { Category } from '../../src/analysis/domain/category';
import { TaskStatus } from '../../src/analysis/domain/task-status';
import { TaskRepository } from '../../src/analysis/task.repository';
import { StorageUnavailableError } from '../../src/common/errors/domain.error';
import { unreachableDatabase, useTestDatabase } from '../support/database';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

describe('TaskRepository', () => {
  const db = useTestDatabase();
  const repository = () => new TaskRepository(db());

  it('inserts a new task and reads it back', async () => {
    const task = createAnalysisTask(TASK_ID, 'dQw4w9WgXcQ');

    await repository().save(task);

    expect(await repository().get(TASK_ID)).toEqual({
      ...task,
      updatedAt: expect.any(Date),
    });
  });

  it('updates an existing task in place', async () => {
    const task = await repository().save(createAnalysisTask(TASK_ID, 'dQw4w9WgXcQ'));
    const result = { [Category.Thanks]: [{ id: 'a', text: 'Thanks!' }] };

    await repository().save({ ...task, status: TaskStatus.Completed, result });

    expect(await repository().get(TASK_ID)).toMatchObject({
      status: TaskStatus.Completed,
      result,
      error: null,
      createdAt: task.createdAt,
    });
    expect(await db().select().from(analysisTasksTable)).toHaveLength(1);
  });

  it('returns null for an unknown task', async () => {
    await expect(repository().get(TASK_ID)).resolves.toBeNull();
  });

  it('does not hide query errors behind StorageUnavailableError', async () => {
    const task = createAnalysisTask(TASK_ID, 'dQw4w9WgXcQ');

    // CHECK в таблице не пропустит неизвестный статус: это баг, а не недоступная база
    const saving = repository().save({ ...task, status: 'unknown' as TaskStatus });

    await expect(saving).rejects.toThrow();
    await expect(saving).rejects.not.toBeInstanceOf(StorageUnavailableError);
  });
});

describe('TaskRepository with Postgres down', () => {
  const { db, pool } = unreachableDatabase();
  afterAll(() => pool.end());

  it('throws StorageUnavailableError', async () => {
    await expect(new TaskRepository(db).get(TASK_ID)).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
  });
});
