import { Module } from '@nestjs/common';
import { COMMENT_SOURCE } from '@/analysis/domain/ports';
import { YoutubeClient } from './youtube.client';

/**
 * Наружу виден только порт COMMENT_SOURCE: другие модули не знают, что за ним YouTube.
 * `useExisting` — алиас: токен указывает на тот же синглтон YoutubeClient.
 */
@Module({
  providers: [YoutubeClient, { provide: COMMENT_SOURCE, useExisting: YoutubeClient }],
  exports: [COMMENT_SOURCE],
})
export class YoutubeModule {}
