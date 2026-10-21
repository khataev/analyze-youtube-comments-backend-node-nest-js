/**
 * Отдельная база для тестов, как test: в database.yml. Задаётся явно, а не выводится
 * из DATABASE_URL, чтобы опечатка в одной переменной не привела к очистке рабочей базы.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/analysis_node_test';
