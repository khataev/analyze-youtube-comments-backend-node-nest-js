/**
 * Доменные исключения. Сервисы бросают их и ничего не знают про HTTP:
 * перевод в коды ответа живёт в одном месте — DomainExceptionFilter.
 * Аналог AppError + add_exception_handler из Python-версии.
 */
export abstract class DomainError extends Error {
  /** Можно ли повторить операцию позже (сеть, 5xx, 429), или ошибка постоянная. */
  readonly retryable: boolean = false;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {}

/** Хранилище (Redis) или очередь недоступны. Детали — в логах, клиенту — общее сообщение. */
export class StorageUnavailableError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('Storage is unavailable', options);
  }
}
