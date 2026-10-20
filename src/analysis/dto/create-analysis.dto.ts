import { z } from 'zod';
import { createZodDto } from '../../common/validation/zod-dto';
import { extractVideoId } from '../youtube-url';

export const createAnalysisSchema = z
  .object({
    url: z.url({ protocol: /^https?$/, error: 'Input should be a valid URL' }),
  })
  .transform((body, ctx) => {
    const videoId = extractVideoId(body.url);
    if (videoId === null) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Not a valid YouTube video URL' });
      return z.NEVER;
    }
    // После валидации контроллер получает уже разобранный id видео
    return { url: body.url, videoId };
  });

/** Тело `POST /api/v1/analysis`. Невалидная или не-YouTube ссылка → 422. */
export class CreateAnalysisDto extends createZodDto(createAnalysisSchema) {}
