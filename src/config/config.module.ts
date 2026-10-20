import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { appConfig } from './app.config';

/**
 * .env ищется относительно этого файла, а не текущего каталога: и src/config, и dist/config
 * лежат на два уровня ниже корня проекта. Поэтому `npm run start:worker` работает
 * из любого каталога (в Python-версии `.env` находился только при запуске из корня).
 */
const ENV_FILE = resolve(__dirname, '..', '..', '.env');

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
