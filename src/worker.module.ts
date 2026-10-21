import { Module } from '@nestjs/common';
import { AnalysisModule } from './analysis/analysis.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggingModule } from './logging/logging.module';
import { QueueModule } from './queue/queue.module';

/** Корневой модуль воркера: те же инфраструктурные модули, но без HTTP и health. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    QueueModule.forRoot('worker'),
    AnalysisModule.forWorker(),
  ],
})
export class WorkerModule {}
