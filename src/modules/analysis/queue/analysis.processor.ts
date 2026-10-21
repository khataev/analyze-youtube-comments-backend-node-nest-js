import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  type BeforeApplicationShutdown,
  Inject,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type AppConfig, appConfig } from '@/core/config/app.config';
import { ANALYSIS_QUEUE } from '@/core/queue/queue.constants';
import { CommentAnalyzer, TaskFailedError } from '@/modules/analysis/comment-analyzer.service';
import {
  ANALYZE_VIDEO_ATTEMPTS,
  ANALYZE_VIDEO_TIMEOUT_MS,
  type AnalyzeVideoJobData,
} from './analyze-video.job';

/**
 * Процессор очереди — аналог класса с `include Sidekiq::Job` и методом `perform`.
 * @Processor регистрирует его в BullMQ: при старте модуля @nestjs/bullmq создаёт Worker,
 * который забирает задачи из очереди и вызывает process().
 *
 * Надёжность (то, чего не было у BRPOP в Python-версии): BullMQ держит задачу под lock,
 * продлевая его, пока процессор работает. Если воркер умер, lock истекает, stalled-checker
 * другого (или перезапущенного) воркера возвращает задачу в очередь. После maxStalledCount
 * таких возвратов задача считается упавшей.
 */
@Processor(ANALYSIS_QUEUE, { lockDuration: 60_000, maxStalledCount: 2 })
export class AnalysisProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly analyzer: CommentAnalyzer,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
    @InjectPinoLogger(AnalysisProcessor.name) private readonly pino: PinoLogger,
  ) {
    super();
  }

  /** Параметры декоратора статичны, а concurrency берём из настроек. */
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.worker.concurrency;
  }

  /** Сам worker.close() вызывает @nestjs/bullmq; здесь только видно в логах, что идёт остановка. */
  beforeApplicationShutdown(signal?: string): void {
    this.logger.log({ signal }, 'Stopping: no new jobs, waiting for active ones to finish');
  }

  /** `signal` BullMQ передаёт третьим аргументом: он срабатывает при отмене задачи. */
  async process(job: Job<AnalyzeVideoJobData>, _token?: string, signal?: AbortSignal) {
    const { taskId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? ANALYZE_VIDEO_ATTEMPTS;
    const timeout = AbortSignal.timeout(ANALYZE_VIDEO_TIMEOUT_MS);

    // Всё, что логируется внутри (сервис, клиенты YouTube и LLM), получит поле task_id
    return this.pino.runInContext(
      async () => {
        this.logger.log(
          {
            job_id: job.id,
            attempt,
            max_attempts: maxAttempts,
            // Больше attempt — задачу уже брали, но воркер умер, не успев её закончить
            attempts_started: job.attemptsStarted,
          },
          'Received by worker',
        );
        try {
          await this.analyzer.run(taskId, {
            attempt,
            isFinalAttempt: attempt >= maxAttempts,
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
        } catch (err) {
          // Статус failed уже сохранён — говорим BullMQ не повторять
          if (err instanceof TaskFailedError) throw new UnrecoverableError(err.message);
          throw err;
        }
      },
      { bindings: { task_id: taskId } },
    );
  }

  /** Lock задачи истёк (воркер умер или завис) — BullMQ вернул её в очередь. */
  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn({ task_id: jobId }, 'Job stalled (worker died?), returned to the queue');
  }

  /**
   * Срабатывает на каждую неудачную попытку. Если попытка последняя или задача
   * исчерпала лимит «зависаний», а статус почему-то не финальный — ставим failed.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AnalyzeVideoJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const stalled = error.message.includes('stalled');
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? ANALYZE_VIDEO_ATTEMPTS);
    if (!stalled && !exhausted && !(error instanceof UnrecoverableError)) return;

    try {
      await this.analyzer.markFailedIfUnfinished(
        job.data.taskId,
        stalled ? 'Processing was interrupted' : 'Internal error',
      );
    } catch (err) {
      this.logger.error({ err, task_id: job.data.taskId }, 'Could not mark task as failed');
    }
  }
}
