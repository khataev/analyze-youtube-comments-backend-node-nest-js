import { existsSync } from 'node:fs';
import { pino } from 'pino';
import { redactUrl } from '../common/redact-url';
import { loadDatabaseConfig } from '../config/app.config';
import { ENV_FILE } from '../config/env-file';
import { basePinoOptions } from '../logging/pino-options';
import { createDatabaseIfMissing, databaseName } from './create-database';
import { runMigrations } from './migrate';
import { describeError } from './postgres';

/**
 * Команды БД без контейнера Nest — им нужен только DATABASE_URL, ключи YouTube и LLM
 * не требуются. Аналог `python -m app.db.create` + `alembic upgrade head` в Python-версии:
 *
 *   node dist/database/cli.js create   — rails db:create
 *   node dist/database/cli.js migrate  — rails db:migrate
 *   node dist/database/cli.js prepare  — rails db:prepare: create + migrate (сервис migrate в Docker)
 */
const COMMANDS = ['create', 'migrate', 'prepare'] as const;
type Command = (typeof COMMANDS)[number];

async function main(command: Command): Promise<void> {
  // Как ConfigModule: .env из корня проекта, уже заданные переменные окружения важнее
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const config = loadDatabaseConfig(process.env);
  const logger = pino(basePinoOptions(config.logLevel)).child({ context: 'Database' });
  const { url } = config.database;
  const fields = { database_url: redactUrl(url) };

  try {
    if (command === 'create' || command === 'prepare') {
      const created = await createDatabaseIfMissing(url);
      const name = databaseName(url);
      logger.info(fields, created ? `Database ${name} created` : `Database ${name} already exists`);
    }
    if (command === 'migrate' || command === 'prepare') {
      await runMigrations(url);
      logger.info(fields, 'Migrations applied');
    }
  } catch (err) {
    logger.error({ ...fields, error: describeError(err) }, `Command "${command}" failed`);
    // Дать pino дописать лог перед выходом
    logger.flush(() => process.exit(1));
  }
}

const command = process.argv[2];
if (!COMMANDS.includes(command as Command)) {
  console.error(`Usage: cli.js <${COMMANDS.join('|')}>`);
  process.exit(2);
}
main(command as Command).catch((err: unknown) => {
  // Ошибка конфигурации: сообщение уже перечисляет все проблемы
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
