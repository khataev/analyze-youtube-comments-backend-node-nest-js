import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AnalysisResult } from './domain/analysis-task';
import { TaskStatus } from './domain/task-status';

const STATUSES = Object.values(TaskStatus);

/**
 * Модель хранения: описание таблицы для Drizzle (суффикс Table, как в документации Drizzle).
 * Аналог AnalysisTaskOrm в Python-версии или схемы из db/schema.rb в Rails, только это
 * исходник: `npm run db:generate` сравнивает его с последней миграцией и пишет SQL в drizzle/.
 *
 * Домен о таблице не знает: TaskRepository переводит строку таблицы в AnalysisTask и обратно.
 */
export const analysisTasksTable = pgTable(
  'analysis_tasks',
  {
    id: uuid('id').primaryKey(),
    videoId: text('video_id').notNull(),
    // enum здесь — только тип TypeScript; в базе значения ограничивает CHECK ниже
    status: text('status', { enum: STATUSES as [TaskStatus, ...TaskStatus[]] }).notNull(),
    result: jsonb('result').$type<AnalysisResult>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'analysis_tasks_status_check',
      sql`${table.status} in (${sql.raw(STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
  ],
);
