import { Module } from '@nestjs/common';
import { ApiModule } from './api.module';
import { LlmModule } from './llm/llm.module';
import { YoutubeModule } from './youtube/youtube.module';

/**
 * Граф для консоли: всё из API (сервис, репозиторий, очередь-продюсер) плюс клиенты
 * YouTube и LLM. Обработчик очереди сюда сознательно не входит: консоль не должна
 * забирать задачи у настоящего воркера.
 */
@Module({ imports: [ApiModule, YoutubeModule, LlmModule] })
export class ReplModule {}
