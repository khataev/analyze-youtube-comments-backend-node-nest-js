import { Module } from '@nestjs/common';
import { COMMENT_CLASSIFIER } from '@/analysis/domain/ports';
import { type AppConfig, appConfig } from '@/config/app.config';
import { createLanguageModel, LANGUAGE_MODEL } from './language-model.factory';
import { LlmCommentClassifier } from './llm-comment-classifier';

@Module({
  providers: [
    {
      // Фабричный провайдер: значение вычисляется из настроек один раз при старте
      provide: LANGUAGE_MODEL,
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => createLanguageModel(config.llm.model, config.llm.apiKey),
    },
    { provide: COMMENT_CLASSIFIER, useClass: LlmCommentClassifier },
  ],
  exports: [COMMENT_CLASSIFIER],
})
export class LlmModule {}
