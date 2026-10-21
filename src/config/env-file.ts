import { resolve } from 'node:path';

/**
 * .env ищется относительно этого файла, а не текущего каталога: и src/config, и dist/config
 * лежат на два уровня ниже корня проекта. Поэтому `npm run start:worker` работает
 * из любого каталога (в Python-версии `.env` находился только при запуске из корня).
 */
export const ENV_FILE = resolve(__dirname, '..', '..', '.env');
