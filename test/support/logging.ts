import { LoggerModule } from 'nestjs-pino';

/**
 * nestjs-pino без вывода: нужен классам, которые внедряют PinoLogger.
 * Функция, а не константа: forRoot() должен вызываться после импорта классов
 * с @InjectPinoLogger — он собирает их контексты в момент вызова.
 */
export function silentLoggerModule() {
  return LoggerModule.forRoot({ pinoHttp: { level: 'silent' } });
}

/**
 * compile() ставит TestingLogger Nest, который печатает ошибки. Там, где ошибки ожидаемы,
 * передаём этот: `.setLogger(quietLogger)`.
 */
export const quietLogger = { log() {}, error() {}, warn() {} };
