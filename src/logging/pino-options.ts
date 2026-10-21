import type { LoggerOptions } from 'pino';

/** Общие настройки pino для приложения и консольных команд (src/database/cli.ts). */
export function basePinoOptions(level: string): LoggerOptions {
  return {
    level,
    // В терминале — читаемый вывод, в Docker и проде — JSON по строке на событие
    transport:
      process.stdout.isTTY && process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } }
        : undefined,
  };
}
