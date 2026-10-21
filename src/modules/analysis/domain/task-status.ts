import { z } from 'zod';

export const TaskStatus = {
  Pending: 'pending',
  Processing: 'processing',
  Completed: 'completed',
  Failed: 'failed',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const taskStatusSchema = z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]);

export function isFinished(status: TaskStatus): boolean {
  return status === TaskStatus.Completed || status === TaskStatus.Failed;
}
