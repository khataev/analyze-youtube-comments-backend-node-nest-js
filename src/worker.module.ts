import { Module } from '@nestjs/common';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { ConfigModule } from './core/config/config.module';
import { DatabaseModule } from './core/database/database.module';
import { LoggingModule } from './core/logging/logging.module';
import { QueueModule } from './core/queue/queue.module';

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
