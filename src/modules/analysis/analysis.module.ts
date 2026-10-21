import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { LlmModule } from '@/modules/llm/llm.module';
import { ANALYSIS_QUEUE } from '@/core/queue/queue.constants';
import { YoutubeModule } from '@/modules/youtube/youtube.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { CommentAnalyzer } from './comment-analyzer.service';
import { TASK_QUEUE } from './domain/ports';
import { AnalysisProcessor } from './queue/analysis.processor';
import { BullMqTaskQueue } from './queue/bullmq-task-queue';
import { TaskRepository } from './task.repository';

/**
 * Модуль домена «анализ комментариев». Модуль в Nest — единица сборки: он перечисляет
 * свои провайдеры (сервисы, репозитории), контроллеры и модули, от которых зависит.
 * Отдалённо похоже на Rails engine, только связи явные.
 *
 * Динамический модуль с двумя вариантами сборки: API и воркер переиспользуют одни классы,
 * но каждый процесс получает только то, что ему нужно. API не тянет клиентов YouTube и LLM
 * и не запускает обработчик очереди; воркер не поднимает HTTP-контроллеры.
 */
@Module({})
export class AnalysisModule {
  static forApi(): DynamicModule {
    return {
      module: AnalysisModule,
      imports: [BullModule.registerQueue({ name: ANALYSIS_QUEUE })],
      controllers: [AnalysisController],
      providers: [
        AnalysisService,
        TaskRepository,
        { provide: TASK_QUEUE, useClass: BullMqTaskQueue },
      ],
    };
  }

  static forWorker(): DynamicModule {
    return {
      module: AnalysisModule,
      imports: [BullModule.registerQueue({ name: ANALYSIS_QUEUE }), YoutubeModule, LlmModule],
      providers: [CommentAnalyzer, TaskRepository, AnalysisProcessor],
    };
  }
}
