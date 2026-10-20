# YouTube Comments Analyzer — backend на NestJS

Реализация того же сервиса, что в [`../backend-python`](../backend-python), на **NestJS + TypeScript**.
Контракт API, переменные окружения и формат записей в Redis совпадают, поэтому фронтенд
работает с любой из версий, а обе версии могут читать задачи друг друга из одного Redis.

Сервис принимает ссылку на YouTube-видео, загружает комментарии через YouTube Data API,
классифицирует их через LLM и отдаёт результат по категориям. Обработка асинхронная:
клиент получает `task_id` и опрашивает статус.

## NestJS за пять минут (для тех, кто знает Rails и FastAPI)

| Nest                          | Что это                                                                                               | Rails                                   | FastAPI                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------- |
| **Модуль** (`@Module`)        | Единица сборки: свои провайдеры и контроллеры, импорты других модулей, что видно наружу (`exports`)   | Отдалённо engine, но связи явные        | `APIRouter` + набор зависимостей |
| **Провайдер** (`@Injectable`) | Класс или значение, которое Nest создаёт сам (по умолчанию один на процесс) и внедряет в конструкторы | Сервис-объект, только без `.new` руками | Функция для `Depends()`          |
| **DI по классу**              | `constructor(private repo: TaskRepository)`: Nest находит провайдер по типу параметра                 | —                                       | `Depends(get_repo)`              |
| **Injection-токен**           | `@Inject(TASK_QUEUE) queue: TaskQueue`: для интерфейсов, которые стираются при компиляции             | —                                       | `Depends(get_task_queue)`        |
| **Контроллер**                | Маршруты и HTTP                                                                                       | Контроллер                              | `APIRouter`                      |
| **Pipe**                      | Валидирует и преобразует аргумент перед вызовом метода контроллера                                    | Strong params + валидации               | Разбор параметров pydantic       |
| **Exception filter**          | Превращает исключения в HTTP-ответы                                                                   | `rescue_from`                           | `add_exception_handler`          |
| **Interceptor**               | Обёртка вокруг вызова обработчика (логирование, кэш, преобразование ответа)                           | `around_action`                         | Middleware/dependency с `yield`  |
| **Lifecycle hooks**           | `onModuleInit`, `onApplicationBootstrap`, `onApplicationShutdown` у провайдеров и модулей             | Initializers, `at_exit`                 | `lifespan`                       |
| **`overrideProvider`**        | Подмена зависимости в тестах                                                                          | Стабы                                   | `app.dependency_overrides`       |

Свои interceptors здесь не понадобились: логирование HTTP делает `nestjs-pino`
(он сам middleware), а ответы формируются в контроллерах.

## Структура

```
src/
├── main.api.ts                # точка входа API: NestFactory.create(ApiModule), CORS, listen
├── main.worker.ts             # точка входа воркера: createApplicationContext(WorkerModule), без HTTP
├── repl.ts, repl.module.ts    # консоль с загруженным приложением (аналог rails c)
├── api.module.ts              # корень API + глобальные pipe и filter (APP_PIPE / APP_FILTER)
├── worker.module.ts           # корень воркера
│
├── config/                    # инфраструктура: конфигурация
│   ├── env.schema.ts          #   zod-схема переменных окружения
│   ├── app.config.ts          #   registerAs('app'): типизированный объект настроек
│   └── config.module.ts       #   @nestjs/config, .env ищется от файла, а не от cwd
├── logging/                   # nestjs-pino: JSON-логи, в терминале pino-pretty
├── redis/                     # провайдер REDIS_CLIENT (ioredis) и его закрытие при остановке
├── queue/                     # BullModule.forRoot: соединения BullMQ для API и для воркера
├── health/                    # GET /health через @nestjs/terminus + свой RedisHealthIndicator
├── common/
│   ├── errors/                # DomainError, NotFoundError, StorageUnavailableError
│   ├── filters/               # DomainExceptionFilter: домен → HTTP, тело {"detail": ...}
│   ├── pipes/                 # ZodValidationPipe: ошибка → 422
│   └── validation/            # createZodDto: zod-схема → класс-DTO
│
├── youtube/                   # YoutubeModule, экспортирует только COMMENT_SOURCE
│   ├── youtube.client.ts      #   fetch + таймаут + пагинация + повторы (p-retry)
│   └── youtube.errors.ts
├── llm/                       # LlmModule, экспортирует только COMMENT_CLASSIFIER
│   ├── language-model.factory.ts  # LLM_MODEL "provider:model" → модель Vercel AI SDK
│   ├── llm-comment-classifier.ts  # батчи, p-limit, структурированный ответ по zod-схеме
│   └── prompt.ts
│
└── analysis/                  # домен «анализ комментариев»
    ├── analysis.module.ts     #   forApi() / forWorker(): две сборки одного модуля
    ├── domain/                #   типы и правила без зависимостей от фреймворка
    │   ├── category.ts, task-status.ts, comment.ts, task-record.ts
    │   ├── group-by-category.ts
    │   ├── ports.ts           #   TaskQueue, CommentSource, CommentClassifier + токены
    │   └── errors.ts
    ├── dto/                   #   вход (zod) и выход (snake_case) HTTP
    ├── youtube-url.ts         #   разбор ссылок → id видео
    ├── analysis.controller.ts #   только HTTP
    ├── analysis.service.ts    #   API-сторона: создать задачу, получить статус
    ├── comment-analyzer.service.ts  # воркер-сторона: обработать задачу
    ├── task.repository.ts     #   статусы в Redis: analysis:task:<uuid>, TTL
    └── queue/
        ├── analyze-video.job.ts     # контракт job: имя, данные, попытки, таймаут
        ├── bullmq-task-queue.ts     # реализация TaskQueue (API ставит задачи)
        └── analysis.processor.ts    # @Processor: воркер забирает задачи
test/
├── support/                   # фейки портов, тестовая конфигурация, сборка API для e2e
├── unit/                      # URL, группировка, конфиг, клиент YouTube (msw), LLM (mock-модель),
│                              # сервисы, репозиторий, адаптер очереди, процессор
└── e2e/                       # HTTP API через supertest; путь API → очередь → процессор
```

### Зависимости

```
controller ──► AnalysisService ──► TaskRepository ──► Redis
                       └─────────► TASK_QUEUE ─────► BullMqTaskQueue ──► BullMQ

AnalysisProcessor ──► CommentAnalyzer ──► TaskRepository
                              ├─────────► COMMENT_SOURCE ─────► YoutubeClient
                              └─────────► COMMENT_CLASSIFIER ─► LlmCommentClassifier ──► AI SDK
```

- Контроллер знает только HTTP. Сервисы не знают ни про HTTP, ни про Redis, ни про BullMQ.
- Сервисы зависят от портов (`domain/ports.ts`). Реализации подключаются в модулях:
  `{ provide: TASK_QUEUE, useClass: BullMqTaskQueue }`.
- `YoutubeModule` и `LlmModule` экспортируют только токены портов, классы клиентов снаружи не видны.
- `AnalysisModule.forApi()` не тянет YouTube и LLM, `forWorker()` не регистрирует контроллеры.
  Поэтому API может стартовать без LLM-ключа провайдера, а воркер — без HTTP.

## Ключевые решения

**Валидация — zod, а не class-validator.** Один язык схем на конфигурацию, тело запроса
и структурированный ответ LLM (AI SDK принимает zod-схему напрямую). Типы выводятся из схемы,
как в pydantic, и не дублируются декораторами. `nestjs-zod` пока не поддерживает Nest 12,
поэтому `createZodDto` и `ZodValidationPipe` написаны в проекте (~50 строк в `common/`).

**Ошибки.** Сервисы бросают наследников `DomainError`, глобальный `DomainExceptionFilter`
переводит их в коды: `NotFoundError` → 404, `StorageUnavailableError` → 503,
неизвестное → 500 без деталей. Ошибки Redis и BullMQ репозиторий и адаптер очереди
заворачивают в `StorageUnavailableError`, поэтому фильтр не знает про ioredis.

**Конфигурация.** `registerAs('app', ...)` + `@Inject(appConfig.KEY)`. В коде нет `process.env`
(кроме `NODE_ENV`). Ошибка в окружении роняет процесс на старте со списком проблем:

```
Invalid environment configuration:
✖ is required
  → at YOUTUBE_API_KEY
✖ Invalid input: expected number, received NaN
  → at LLM_BATCH_SIZE
```

**Очередь — BullMQ (`@nestjs/bullmq`).** Ближайший аналог Sidekiq:

- `jobId = task_id`, поэтому повторная постановка не создаёт дубль;
- 3 попытки с экспоненциальной паузой (5 с, 10 с) для временных ошибок. Постоянные
  (видео не найдено, 403, 400, отказ LLM-провайдера) сразу дают `failed` через `UnrecoverableError`;
- **задача не теряется при падении воркера**. BullMQ держит её под lock и продлевает его,
  пока процессор работает. Если процесс умер, lock истекает (`lockDuration: 60s`), stalled-checker
  возвращает задачу в очередь, и её берёт любой живой воркер. В Python-версии `BRPOP`
  удалял сообщение сразу при получении;
- задача не зависает в `processing`: последняя попытка всегда ставит финальный статус,
  а обработчик события `failed` страхует случаи вне процессора (исчерпан лимит «зависаний»);
- таймаут задачи 10 минут через `AbortSignal`, который доходит до `fetch` и вызовов LLM.

**Соединения с Redis** (`queue/queue.module.ts`, `redis/redis.module.ts`):

- воркер: `maxRetriesPerRequest: null` (требование BullMQ к Worker) и **никакого `commandTimeout`**.
  Иначе ioredis оборвал бы блокирующее ожидание задачи (`BZPOPMIN`) на паузах в очереди.
  В Python-версии ровно так и случилось с `socket_timeout=5` в redis-py 8;
- API: `enableOfflineQueue: false`, поэтому при недоступном Redis запрос сразу получает 503, а не висит;
- клиент для статусов задач — отдельный, с коротким `commandTimeout`. Он не делает блокирующих команд.

**LLM — Vercel AI SDK.** `generateText` + `Output.object({ schema })`: формат ответа задаёт
zod-схема, SDK валидирует ответ. Провайдер выбирается из `LLM_MODEL=provider:model`
(`deepseek`, `openai`, `anthropic`; новый — одна строка в `language-model.factory.ts`).
Комментарии передаются как JSON, промпт запрещает выполнять инструкции из них. Выдуманные моделью
и повторяющиеся `id` отбрасываются. Батчи идут параллельно, но не больше `LLM_CONCURRENCY`
одновременно. Первая ошибка отменяет остальные батчи.

**Логи.** `nestjs-pino`, в коде обычный `new Logger(Context)` из Nest. Процессор запускает
обработку в `PinoLogger.runInContext(..., { bindings: { task_id } })` (AsyncLocalStorage),
поэтому **все** логи задачи, включая логи клиентов YouTube и LLM, получают поле `task_id` без
передачи его руками. Ключ YouTube передаётся в заголовке `X-Goog-Api-Key`, пароль в `REDIS_URL`
в логах маскируется.

## Отличия от Python-версии

|                               | Python (FastAPI)                           | Node (NestJS)                                                                      |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Сборка зависимостей           | `Depends` + `lifespan` + `app.state`       | Модули, провайдеры, DI-контейнер                                                   |
| Абстракции сервисов           | `Protocol`                                 | Интерфейсы + injection-токены                                                      |
| Валидация                     | pydantic                                   | zod (+ свой pipe)                                                                  |
| Очередь                       | taskiq, `ListQueueBroker` (`BRPOP`)        | BullMQ: lock, stalled-recovery, попытки, `UnrecoverableError`                      |
| Задача при падении воркера    | Теряется                                   | Возвращается в очередь                                                             |
| Повтор при временной ошибке   | Нет: сразу `failed`                        | До 3 попыток, между ними статус `pending`                                          |
| Таймаут задачи                | `timeout=600` у taskiq                     | `AbortSignal`, доходит до HTTP-запросов                                            |
| Параллельность LLM            | `asyncio.gather` без ограничения           | `p-limit` (`LLM_CONCURRENCY`)                                                      |
| HTTP-клиент YouTube           | httpx + tenacity                           | встроенный `fetch` + p-retry                                                       |
| LLM                           | pydantic-ai                                | Vercel AI SDK                                                                      |
| Логи                          | `logging`, текст, `[task_id]` в сообщении  | pino, JSON, `task_id` полем через AsyncLocalStorage                                |
| `.env`                        | Ищется в текущем каталоге                  | Ищется от файла модуля, cwd не важен                                               |
| Health                        | `{"status": "ok"}`                         | `{"status": "ok", "info": {"redis": ...}, ...}` (формат terminus; `status` тот же) |
| Ошибка YouTube после повторов | `Internal error`                           | `YouTube API is temporarily unavailable`                                           |
| Тесты                         | pytest, fakeredis, respx, `InMemoryBroker` | Vitest, фейки портов, msw, `MockLanguageModelV4`, мок `queue.add`                  |
| OpenAPI                       | `/docs` из коробки                         | Нет (см. «Что можно добавить»)                                                     |

Новые переменные окружения (у всех есть значения по умолчанию, `.env` Python-версии подходит как есть):
`LLM_CONCURRENCY` (4), `WORKER_CONCURRENCY` (2), `PORT` (8000).

## API

| Метод  | Путь                                | Ответ                                                                                                            |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/analysis` `{"url": "..."}` | `202 {"task_id": "..."}`; невалидная или не-YouTube ссылка → `422`                                               |
| `GET`  | `/api/v1/analysis/{task_id}`        | `200 {"task_id", "status", "result", "error"}`; не UUID → `422`; нет задачи → `404 {"detail": "Task not found"}` |
| `GET`  | `/health`                           | `200 {"status": "ok", ...}` или `503`, если Redis недоступен                                                     |

Redis недоступен на любом маршруте → `503 {"detail": "Storage is unavailable"}`.
Ссылки: `youtube.com/watch?v=`, `youtu.be/<id>`, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`.

## Запуск

Нужен Node.js 24 LTS (в проекте `mise.toml`, `engines` в `package.json`); npm идёт в комплекте.
Скрипты, кроме `test`, запускаются через `npm run <имя>`.

```bash
cp .env.example .env   # заполнить YOUTUBE_API_KEY, LLM_MODEL и LLM_API_KEY
npm install
```

### Локально

Нужен Redis (`brew services start redis` или `docker compose up redis`).

```bash
npm run start:api:dev     # API с перезапуском при изменениях (nest start --watch)
npm run start:worker:dev  # воркер, в отдельном терминале

# или из собранного кода:
npm run build
npm run start:api
npm run start:worker
```

`.env` находится от любого текущего каталога: `cd /tmp && node ~/…/backend-node/dist/main.worker.js` работает.

### Docker

```bash
docker compose up --build
```

Один образ (многоэтапный `Dockerfile`: deps → build → runtime без dev-зависимостей,
пользователь `node`), сервисы `redis`, `api`, `worker`. У воркера `stop_grace_period: 60s`:
по `SIGTERM` он дорабатывает текущие задачи.

### Консоль (аналог `rails c`)

```bash
npm run console  # nest start --entryFile repl; из собранного кода: node dist/repl.js
```

```js
> const s = get(AnalysisService)
> const task = await s.start('dQw4w9WgXcQ')                 // поставить задачу в очередь
> await s.get(task.taskId)                                    // статус
> await $(TaskRepository).get(task.taskId)                    // $() — короткий get()
> await get(YoutubeClient).fetchComments('dQw4w9WgXcQ')       // клиент YouTube напрямую
> methods(AnalysisService)                                    // список методов
> debug()                                                     // все модули и провайдеры
```

`repl()` из `@nestjs/core` собирает `ReplModule`: всё из API плюс клиенты YouTube и LLM.
HTTP-сервер не поднимается, обработчик очереди не подключается, поэтому консоль не забирает
задачи у настоящего воркера. Токены портов (`COMMENT_SOURCE` и т.п.) в консоли не определены,
поэтому реализации удобнее доставать по классу (`YoutubeClient`, `LlmCommentClassifier`).
Логи в консоли печатает собственный `ReplLogger` Nest, а не pino.

## Проверки

```bash
npm test             # 76 тестов, без Redis, YouTube и LLM
npm run lint         # ESLint (typescript-eslint strictTypeChecked) + Prettier-совместимость
npm run format:check
npm run typecheck    # tsc --noEmit, strict
```

Что подменяется в тестах:

- Redis для статусов → `InMemoryTaskRepository` или мок `get`/`set` в тесте репозитория;
- BullMQ → объект с `add: vi.fn()` через `overrideProvider(getQueueToken('analysis'))`;
  тест проверяет аргументы. Поведение самого BullMQ (lock, повторы) — забота библиотеки;
- YouTube → `msw` перехватывает `fetch`;
- LLM → `MockLanguageModelV4` из `ai/test` и фейки портов.

Тест `test/e2e/api-queue-processor.e2e.spec.ts` проходит путь целиком: `POST` через HTTP →
забираем то, что API положил в `queue.add()` → отдаём это как `Job` процессору воркера →
`GET` возвращает `completed` с результатом.

Ручная проверка живого стека:

```bash
curl -X POST localhost:8000/api/v1/analysis -H 'content-type: application/json' \
     -d '{"url": "https://youtu.be/dQw4w9WgXcQ"}'
curl localhost:8000/api/v1/analysis/<task_id>
```

По логам сразу видно, где проблема: после `Task enqueued` в логах API должна появиться строка
`Received by worker` с тем же `task_id` в логах воркера. Если её нет, воркер не запущен
или слушает другой Redis/очередь (оба процесса пишут их при старте).

## Что можно добавить

- OpenAPI (`@nestjs/swagger`) — потребует описать zod-DTO для Swagger (например, `zod-to-openapi`).
- Bull Board — веб-интерфейс очереди, аналог Sidekiq Web.
