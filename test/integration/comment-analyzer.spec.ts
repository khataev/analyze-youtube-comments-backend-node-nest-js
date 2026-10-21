import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommentAnalyzer, TaskFailedError } from '@/analysis/comment-analyzer.service';
import { Category } from '@/analysis/domain/category';
import { COMMENT_CLASSIFIER, COMMENT_SOURCE } from '@/analysis/domain/ports';
import { createAnalysisTask } from '@/analysis/domain/analysis-task';
import { TaskStatus } from '@/analysis/domain/task-status';
import { TaskRepository } from '@/analysis/task.repository';
import { VideoNotFoundError, YoutubeUnavailableError } from '@/youtube/youtube.errors';
import { useTestDatabase } from '@test/support/database';
import { FakeClassifier, FakeSource } from '@test/support/fakes';
import { quietLogger } from '@test/support/logging';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

describe('CommentAnalyzer', () => {
  const db = useTestDatabase();
  let analyzer: CommentAnalyzer;
  let repository: TaskRepository;
  let source: FakeSource;
  let classifier: FakeClassifier;

  beforeEach(async () => {
    repository = new TaskRepository(db());
    source = new FakeSource([
      { id: 'a', text: 'Thanks!' },
      { id: 'b', text: 'Thank you' },
    ]);
    classifier = new FakeClassifier(Category.Thanks);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentAnalyzer,
        { provide: TaskRepository, useValue: repository },
        { provide: COMMENT_SOURCE, useValue: source },
        { provide: COMMENT_CLASSIFIER, useValue: classifier },
      ],
    })
      .setLogger(quietLogger)
      .compile();
    analyzer = moduleRef.get(CommentAnalyzer);

    await repository.save(createAnalysisTask(TASK_ID, 'dQw4w9WgXcQ'));
  });

  const status = async () => repository.get(TASK_ID);

  it('completes the task with grouped comments', async () => {
    await analyzer.run(TASK_ID, { isFinalAttempt: false });

    expect(await status()).toMatchObject({
      status: TaskStatus.Completed,
      error: null,
      result: {
        [Category.Thanks]: [
          { id: 'a', text: 'Thanks!' },
          { id: 'b', text: 'Thank you' },
        ],
      },
    });
  });

  it('completes with an empty result when there are no comments', async () => {
    source.comments = [];

    await analyzer.run(TASK_ID, { isFinalAttempt: false });

    expect(await status()).toMatchObject({ status: TaskStatus.Completed, result: {} });
  });

  it('fails without retries on a permanent domain error', async () => {
    source.error = new VideoNotFoundError();

    await expect(analyzer.run(TASK_ID, { isFinalAttempt: false })).rejects.toBeInstanceOf(
      TaskFailedError,
    );
    expect(await status()).toMatchObject({ status: TaskStatus.Failed, error: 'Video not found' });
  });

  it('returns the task to pending and rethrows a transient error for a retry', async () => {
    source.error = new YoutubeUnavailableError();

    await expect(analyzer.run(TASK_ID, { isFinalAttempt: false })).rejects.toBeInstanceOf(
      YoutubeUnavailableError,
    );
    expect(await status()).toMatchObject({ status: TaskStatus.Pending });
  });

  it('marks the task as failed on the final attempt, hiding internal details', async () => {
    classifier.classify = () => Promise.reject(new Error('secret stack details'));

    await expect(analyzer.run(TASK_ID, { isFinalAttempt: true })).rejects.toBeInstanceOf(
      TaskFailedError,
    );
    expect(await status()).toMatchObject({ status: TaskStatus.Failed, error: 'Internal error' });
  });

  it('reports a timeout when the job signal times out', async () => {
    const signal = AbortSignal.abort(new DOMException('timeout', 'TimeoutError'));
    source.error = new Error('aborted');

    await expect(analyzer.run(TASK_ID, { isFinalAttempt: false, signal })).rejects.toBeInstanceOf(
      TaskFailedError,
    );
    expect(await status()).toMatchObject({
      status: TaskStatus.Failed,
      error: 'Analysis timed out',
    });
  });

  it('skips an already finished task (repeated delivery)', async () => {
    const task = await status();
    await repository.save({ ...task!, status: TaskStatus.Completed, result: {} });
    source.error = new Error('must not be called');

    await analyzer.run(TASK_ID, { isFinalAttempt: false });

    expect(await status()).toMatchObject({ status: TaskStatus.Completed });
  });

  it('skips an expired task', async () => {
    await expect(
      analyzer.run('22222222-2222-4222-8222-222222222222', { isFinalAttempt: false }),
    ).resolves.toBeUndefined();
  });

  it('markFailedIfUnfinished does not overwrite a finished task', async () => {
    await analyzer.run(TASK_ID, { isFinalAttempt: false });
    await analyzer.markFailedIfUnfinished(TASK_ID, 'Processing was interrupted');
    expect(await status()).toMatchObject({ status: TaskStatus.Completed });
  });
});
