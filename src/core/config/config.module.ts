import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { appConfig } from './app.config';
import { ENV_FILE } from './env-file';

@Module({
  imports: [
    NestConfigModule.forRoot({
      // Глобальный модуль: appConfig.KEY доступен в любом модуле без явного импорта
      isGlobal: true,
      load: [appConfig],
      envFilePath: ENV_FILE,
      // В тестах конфигурация задаётся явно, локальный .env не должен на неё влиять
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
  ],
})
export class ConfigModule {}
