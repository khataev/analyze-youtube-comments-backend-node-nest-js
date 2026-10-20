import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { ANALYZE_VIDEO_JOB } from '../../src/analysis/queue/analyze-video.job';
import { BullMqTaskQueue } from '../../src/analysis/queue/bullmq-task-queue';
import { StorageUnavailableError } from '../../src/common/errors/domain.error';
import { appConfig } from '../../src/config/app.config';
import { ANALYSIS_QUEUE } from '../../src/queue/queue.constants';
import { testConfig } from '../support/config';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

async function createQueue(add: ReturnType<typeof vi.fn>) {
  // Вместо настоящей Queue BullMQ (и Redis) — объект с замоканным add()
  const moduleRef = await Test.createTestingModule({
    providers: [
      BullMqTaskQueue,
      { provide: getQueueToken(ANALYSIS_QUEUE), useValue: { add } },
      { provide: appConfig.KEY, useValue: testConfig({ TASK_TTL_SECONDS: '3600' }) },
    ],
  }).compile();
  return moduleRef.get(BullMqTaskQueue);
}

describe('BullMqTaskQueue', () => {
  it('adds a job with jobId = task id, retries and cleanup by TTL', async () => {
    const add = vi.fn().mockResolvedValue({ id: TASK_ID });

    await (await createQueue(add)).enqueueAnalysis(TASK_ID);

    expect(add).toHaveBeenCalledWith(
      ANALYZE_VIDEO_JOB,
      { taskId: TASK_ID },
      expect.objectContaining({
        jobId: TASK_ID,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      }),
    );
  });

  it('turns queue errors into StorageUnavailableError', async () => {
    const add = vi.fn().mockRejectedValue(new Error('Connection is closed'));

    await expect((await createQueue(add)).enqueueAnalysis(TASK_ID)).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
  });
});
