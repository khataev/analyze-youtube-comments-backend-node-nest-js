import { DomainError } from '../common/errors/domain.error';

export class LlmError extends DomainError {
  override readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.retryable = retryable;
  }
}
