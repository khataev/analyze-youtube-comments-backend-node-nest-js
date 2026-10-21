import { Test } from '@nestjs/testing';
import { type Job, UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentAnalyzer, TaskFailedError } from '@/modules/analysis/comment-analyzer.service';
import { AnalysisProcessor } from '@/modules/analysis/queue/analysis.processor';
import type { AnalyzeVideoJobData } from '@/modules/analysis/queue/analyze-video.job';
import { appConfig } from '@/core/config/app.config';
import { testConfig } from '@test/support/config';
import { silentLoggerModule } from '@test/support/logging';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

/** Job BullMQ — просто объект с нужными процессору полями. Redis не нужен. */
function fakeJob(attemptsMade = 0): Job<AnalyzeVideoJobData> {
  return {
    id: TASK_ID,
    data: { taskId: TASK_ID },
    attemptsMade,
    opts: { attempts: 3 },
  } as Job<AnalyzeVideoJobData>;
}

describe('AnalysisProcessor', () => {
  let processor: AnalysisProcessor;
  const analyzer = { run: vi.fn(), markFailedIfUnfinished: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [silentLoggerModule()],
      providers: [
        AnalysisProcessor,
        { provide: CommentAnalyzer, useValue: analyzer },
        { provide: appConfig.KEY, useValue: testConfig() },
      ],
    }).compile();
    processor = moduleRef.get(AnalysisProcessor);
  });

  it('runs the analyzer with attempt info and a timeout signal', async () => {
    await processor.process(fakeJob(1));

    expect(analyzer.run).toHaveBeenCalledWith(TASK_ID, {
      attempt: 2,
      isFinalAttempt: false,
      signal: expect.any(AbortSignal),
    });
  });

  it('flags the last attempt as final', async () => {
    await processor.process(fakeJob(2));

    expect(analyzer.run).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ attempt: 3, isFinalAttempt: true }),
    );
  });

  it('tells BullMQ not to retry a task that is already marked failed', async () => {
    analyzer.run.mockRejectedValue(new TaskFailedError('Video not found'));

    await expect(processor.process(fakeJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('rethrows transient errors so BullMQ retries the job', async () => {
    const error = new Error('network');
    analyzer.run.mockRejectedValue(error);

    await expect(processor.process(fakeJob())).rejects.toBe(error);
  });

  describe('on the failed event', () => {
    it('ignores an attempt that will be retried', async () => {
      await processor.onFailed(fakeJob(1), new Error('network'));
      expect(analyzer.markFailedIfUnfinished).not.toHaveBeenCalled();
    });

    it('marks the task failed when attempts are exhausted', async () => {
      await processor.onFailed(fakeJob(3), new Error('network'));
      expect(analyzer.markFailedIfUnfinished).toHaveBeenCalledWith(TASK_ID, 'Internal error');
    });

    it('marks the task failed when the job stalled too many times', async () => {
      await processor.onFailed(fakeJob(0), new Error('job stalled more than allowable limit'));
      expect(analyzer.markFailedIfUnfinished).toHaveBeenCalledWith(
        TASK_ID,
        'Processing was interrupted',
      );
    });
  });
});
