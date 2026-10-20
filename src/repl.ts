import { repl } from '@nestjs/core';
import { ReplModule } from './repl.module';

/**
 * Аналог `rails c`: интерактивная консоль с загруженным приложением.
 *   npm run console
 *   > await get(AnalysisService).start('dQw4w9WgXcQ')
 *   > await $(TaskRepository).get('<task_id>')
 * Встроенные команды: help(), debug(), methods(AnalysisService).
 */
async function bootstrap(): Promise<void> {
  const replServer = await repl(ReplModule);
  replServer.setupHistory('.nest_repl_history', (err) => {
    if (err) console.error(err);
  });
}

void bootstrap();
