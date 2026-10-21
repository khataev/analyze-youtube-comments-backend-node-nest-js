import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { StorageUnavailableError } from '@/common/errors/domain.error';
import { DATABASE, type Database } from '@/core/database/database.constants';
import { isConnectionError } from '@/core/database/postgres';
import { analysisTasksTable } from './analysis-task.table';
import type { AnalysisTask } from './domain/analysis-task';

type AnalysisTaskColumns = typeof analysisTasksTable.$inferSelect;

/**
 * Хранение задач в Postgres. Сервисы работают с доменной AnalysisTask и не знают о таблице:
 * репозиторий переводит одно в другое.
 *
 * Каждая операция — один SQL-оператор, то есть своя короткая транзакция (autocommit):
 * соединение берётся из пула на время запроса, даже если обработка задачи идёт минутами.
 * Если операции понадобится несколько операторов, её нужно обернуть в this.db.transaction().
 *
 * Ошибки соединения переводятся в доменную StorageUnavailableError (503). Остальные ошибки
 * базы — это баги (нет таблицы, нарушено ограничение), их не маскируем.
 */
@Injectable()
export class TaskRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Создать или обновить задачу (upsert). updated_at ставит база. */
  async save(task: AnalysisTask): Promise<AnalysisTask> {
    const changes = {
      status: task.status,
      result: task.result,
      error: task.error,
      updatedAt: sql`now()`,
    };
    const [saved] = await this.call(() =>
      this.db
        .insert(analysisTasksTable)
        .values({ id: task.id, videoId: task.videoId, createdAt: task.createdAt, ...changes })
        .onConflictDoUpdate({ target: analysisTasksTable.id, set: changes })
        .returning(),
    );
    if (saved === undefined) throw new Error(`Task ${task.id} was not saved`);
    return toDomain(saved);
  }

  async get(id: string): Promise<AnalysisTask | null> {
    const [found] = await this.call(() =>
      this.db.select().from(analysisTasksTable).where(eq(analysisTasksTable.id, id)).limit(1),
    );
    return found === undefined ? null : toDomain(found);
  }

  private async call<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (err) {
      if (isConnectionError(err)) throw new StorageUnavailableError({ cause: err });
      throw err;
    }
  }
}

function toDomain(stored: AnalysisTaskColumns): AnalysisTask {
  return {
    id: stored.id,
    videoId: stored.videoId,
    status: stored.status,
    result: stored.result,
    error: stored.error,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}
