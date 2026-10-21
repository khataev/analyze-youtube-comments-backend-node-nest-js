import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { AnalyzeRequest } from './dto/analyze-request.dto';
import { TaskCreatedResponse, TaskStatusResponse } from './dto/task-responses.dto';

/**
 * Контроллер знает только HTTP: маршруты, коды ответа, преобразование в DTO.
 * Валидацию тела делает глобальный ZodValidationPipe, ошибки — DomainExceptionFilter.
 * Аналог APIRouter в FastAPI или контроллера Rails.
 */
@Controller('api/v1/analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: AnalyzeRequest): Promise<TaskCreatedResponse> {
    const task = await this.analysis.start(body.videoId);
    return new TaskCreatedResponse(task.id);
  }

  @Get(':taskId')
  async get(
    // Встроенный pipe: не-UUID → 422 (по умолчанию было бы 400)
    @Param('taskId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    taskId: string,
  ): Promise<TaskStatusResponse> {
    return TaskStatusResponse.fromTask(await this.analysis.get(taskId));
  }
}
