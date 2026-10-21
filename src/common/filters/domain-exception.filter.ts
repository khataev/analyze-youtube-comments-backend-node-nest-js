import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, NotFoundError, StorageUnavailableError } from '@/common/errors/domain.error';

/**
 * Глобальный exception filter — аналог `rescue_from` в Rails или `add_exception_handler` в FastAPI.
 * Nest вызывает его для любого исключения, вылетевшего из контроллера, pipe или guard.
 *
 * Тело ответа об ошибке всегда `{"detail": ...}`, как у FastAPI: общий фронтенд ждёт этот формат.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<{ method: string; url: string }>();

    const { status, body } = this.toResponse(exception);
    if (status >= 500) {
      this.logger.error(
        { err: exception, method: request.method, path: request.url },
        `Request failed with ${status}`,
      );
    }
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: object } {
    if (exception instanceof DomainError) {
      return { status: domainStatus(exception), body: { detail: exception.message } };
    }
    if (exception instanceof HttpException) {
      // Исключения самого Nest (404 маршрута, 422 из pipe, 503 из terminus)
      const payload = exception.getResponse();
      const body =
        typeof payload === 'object' && 'detail' in payload ? payload : httpDetail(exception);
      return { status: exception.getStatus(), body };
    }
    // Неизвестная ошибка: стек — в лог, клиенту — ничего лишнего
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { detail: 'Internal Server Error' },
    };
  }
}

function domainStatus(error: DomainError): number {
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof StorageUnavailableError) return HttpStatus.SERVICE_UNAVAILABLE;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function httpDetail(exception: HttpException): object {
  const payload = exception.getResponse();
  // Ответ terminus (health) оставляем как есть: в нём статусы отдельных проверок
  if (typeof payload === 'object' && 'status' in payload) return payload;
  return { detail: exception.message };
}
