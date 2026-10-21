import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  ANALYZE_VIDEO_JOB,
  ANALYZE_VIDEO_KEEP_COMPLETED,
  ANALYZE_VIDEO_KEEP_FAILED,
} from '@/modules/analysis/queue/analyze-video.job';
import { BullMqTaskQueue } from '@/modules/analysis/queue/bullmq-task-queue';
import { StorageUnavailableError } from '@/common/errors/domain.error';
import { ANALYSIS_QUEUE } from '@/core/queue/queue.constants';

const TASK_ID = '11111111-1111-4111-8111-111111111111';

async function createQueue(add: ReturnType<typeof vi.fn>) {
  // Вместо настоящей Queue BullMQ (и Redis) — объект с замоканным add()
  const moduleRef = await Test.createTestingModule({
    providers: [BullMqTaskQueue, { provide: getQueueToken(ANALYSIS_QUEUE), useValue: { add } }],
  }).compile();
  return moduleRef.get(BullMqTaskQueue);
}

describe('BullMqTaskQueue', () => {
  it('adds a job with jobId = task id, retries and bounded job retention', async () => {
    const add = vi.fn().mockResolvedValue({ id: TASK_ID });

    await (await createQueue(add)).enqueueAnalysis(TASK_ID);

    expect(add).toHaveBeenCalledWith(
      ANALYZE_VIDEO_JOB,
      { taskId: TASK_ID },
      expect.objectContaining({
        jobId: TASK_ID,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: ANALYZE_VIDEO_KEEP_COMPLETED,
        removeOnFail: ANALYZE_VIDEO_KEEP_FAILED,
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
