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
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { TaskCreatedResponse, TaskStatusResponse } from './dto/task.responses';

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
  async start(@Body() body: CreateAnalysisDto): Promise<TaskCreatedResponse> {
    const record = await this.analysis.start(body.videoId);
    return new TaskCreatedResponse(record.taskId);
  }

  @Get(':taskId')
  async get(
    // Встроенный pipe: не-UUID → 422 (по умолчанию было бы 400)
    @Param('taskId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    taskId: string,
  ): Promise<TaskStatusResponse> {
    return TaskStatusResponse.fromRecord(await this.analysis.get(taskId));
  }
}
