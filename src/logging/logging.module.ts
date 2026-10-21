import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { type AppConfig, appConfig } from '../config/app.config';
import { basePinoOptions } from './pino-options';

/**
 * Структурированные логи через pino. После `app.useLogger(app.get(Logger))` в main-файлах
 * стандартный `new Logger(Context)` из @nestjs/common пишет в pino, так что в коде
 * используется обычный логгер Nest, а на выходе — JSON (или цветной текст в dev).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          ...basePinoOptions(config.logLevel),
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-goog-api-key"]',
          ],
          autoLogging: { ignore: (req) => req.url === '/health' },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
