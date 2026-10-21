import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
  UnprocessableEntityException,
} from '@nestjs/common';
import { isZodDto } from '@/common/validation/zod-dto';

/**
 * Pipe — это шаг между HTTP-запросом и аргументом метода контроллера: он валидирует
 * и/или преобразует значение. В FastAPI ту же работу делает pydantic при разборе параметров,
 * в Rails — strong parameters + валидации модели.
 *
 * Pipe глобальный (APP_PIPE в ApiModule): для каждого параметра с классом-DTO из createZodDto
 * он прогоняет значение через схему. Ошибка → 422 (у Nest по умолчанию 400, у FastAPI 422).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!isZodDto(metadata.metatype)) return value;

    const result = metadata.metatype.schema.safeParse(value);
    if (result.success) return result.data;

    throw new UnprocessableEntityException({
      detail: result.error.issues.map((issue) => ({
        loc: [metadata.type, ...issue.path.map(String)],
        msg: issue.message,
        type: issue.code,
      })),
    });
  }
}
