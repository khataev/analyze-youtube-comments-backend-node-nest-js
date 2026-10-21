# YouTube Comments Analyzer — backend на NestJS

Реализация того же сервиса, что в [`../backend-python`](../backend-python), на **NestJS + TypeScript**.
Контракт API и переменные окружения совпадают, поэтому фронтенд работает с любой из версий.
Redis и Postgres общие для всех реализаций (`../docker-compose.yml`), но у каждой своя база:
у этой — `analysis_node` (тесты — `analysis_node_test`) и Redis DB `2`.

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
| **`@Global` модуль**          | Провайдеры видны всем модулям без импорта (здесь — пул Postgres, клиент Redis, конфигурация)          | Глобальные `ActiveRecord::Base` и т.п.  | Общий `engine` в `app.state`     |

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
│   ├── env.schema.ts          #   zod-схемы окружения: databaseEnvSchema ⊂ envSchema
│   ├── app.config.ts          #   registerAs('app') для приложения, loadDatabaseConfig() для команд БД
│   ├── env-file.ts            #   путь к .env от файла, а не от cwd
│   └── config.module.ts       #   @nestjs/config
├── database/                  # инфраструктура: Postgres
│   ├── database.module.ts     #   @Global: пул pg (PG_POOL) и Drizzle (DATABASE), закрытие пула
│   ├── postgres.ts            #   настройки пула, «база недоступна» vs «ошибка запроса»
│   ├── create-database.ts     #   CREATE DATABASE, если её нет (аналог rails db:create)
│   ├── migrate.ts             #   применение SQL-миграций из drizzle/
│   └── cli.ts                 #   create | migrate | prepare — без контейнера Nest и без ключей API
├── logging/                   # nestjs-pino: JSON-логи, в терминале pino-pretty
├── redis/                     # провайдер REDIS_CLIENT (ioredis) — только для health-check
├── queue/                     # BullModule.forRoot: соединения BullMQ для API и для воркера
├── health/                    # GET /health через @nestjs/terminus: свои индикаторы Postgres и Redis
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
    ├── domain/                #   типы и правила без зависимостей от фреймворка и БД
    │   ├── analysis-task.ts   #   доменная сущность AnalysisTask
    │   ├── category.ts, task-status.ts, comment.ts
    │   ├── group-by-category.ts
    │   ├── ports.ts           #   TaskQueue, CommentSource, CommentClassifier + токены
    │   └── errors.ts
    ├── dto/                   #   вход (zod) и выход (snake_case) HTTP
    ├── youtube-url.ts         #   разбор ссылок → id видео
    ├── analysis.controller.ts #   только HTTP
    ├── analysis.service.ts    #   API-сторона: создать задачу, получить статус
    ├── comment-analyzer.service.ts  # воркер-сторона: обработать задачу
    ├── analysis-task.table.ts #   модель хранения: таблица analysis_tasks (Drizzle)
    ├── task.repository.ts     #   AnalysisTask ⇄ analysis_tasks, ошибки соединения → 503
    └── queue/
        ├── analyze-video.job.ts     # контракт job: имя, данные, попытки, таймаут
        ├── bullmq-task-queue.ts     # реализация TaskQueue (API ставит задачи)
        └── analysis.processor.ts    # @Processor: воркер забирает задачи
drizzle/                       # SQL-миграции и снимки схемы, генерирует drizzle-kit
drizzle.config.ts              # настройки drizzle-kit (только для генерации миграций)
test/
├── global-setup.ts            # один раз на прогон: тестовая база + миграции с нуля
├── support/                   # транзакция теста, фейки портов, тестовая конфигурация, сборка API
├── unit/                      # без базы: URL, группировка, конфиг, клиент YouTube (msw),
│                              # LLM (mock-модель), адаптер очереди, процессор
├── integration/               # с тестовой базой: репозиторий, AnalysisService, CommentAnalyzer
└── e2e/                       # HTTP API через supertest; путь API → очередь → процессор
```

Имена файлов — kebab-case с ролью через точку (`analysis.service.ts`, `analyze-request.dto.ts`),
как генерирует Nest CLI. Импорты выше по дереву — через алиасы из `tsconfig.json`:
`@/config/app.config` (это `src/`) и `@test/support/fakes`. Соседние файлы модуля — через `./`,
чтобы при переносе папки целиком эти импорты не менялись. `../` запрещён правилом ESLint.
`nest build` переписывает алиасы в относительные пути, Vitest читает их из `tsconfig.json`
(`resolve.tsconfigPaths`).

### Зависимости

```
controller ──► AnalysisService ──► TaskRepository ──► Drizzle ──► Postgres
                       └─────────► TASK_QUEUE ─────► BullMqTaskQueue ──► BullMQ

AnalysisProcessor ──► CommentAnalyzer ──► TaskRepository
                              ├─────────► COMMENT_SOURCE ─────► YoutubeClient
                              └─────────► COMMENT_CLASSIFIER ─► LlmCommentClassifier ──► AI SDK
```

- Контроллер знает только HTTP. Сервисы не знают ни про HTTP, ни про Postgres, ни про BullMQ.
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
неизвестное → 500 без деталей. Репозиторий заворачивает в `StorageUnavailableError` ошибки
соединения с Postgres (отказ, таймаут пула, SQLSTATE `08xxx`, `57P0x`, `53300`), адаптер
очереди — ошибки BullMQ. Остальные ошибки базы — баги (нет таблицы, нарушен CHECK), они
не маскируются под 503 и дают 500. Фильтр не знает ни про `pg`, ни про ioredis.

**Хранение задач — Postgres + Drizzle ORM.** Таблица `analysis_tasks` (`id` uuid, `video_id`,
`status`, `result` jsonb, `error`, `created_at`, `updated_at`), записи бессрочные.
Почему Drizzle:

- схема таблицы — обычный TypeScript (`analysis-task.table.ts`), запросы почти как SQL
  и полностью типизированы. Ближе всего к SQLAlchemy Core, без магии и Unit of Work;
- вложенный `db.transaction()` становится `SAVEPOINT`, поэтому тесты изолируются откатом
  транзакции, как в Rails. У Prisma вложенных транзакций нет, пришлось бы чистить таблицы;
- TypeORM чаще встречается в Nest-проектах, но у него слабее типизация (nullable-колонки,
  `findOne` с `null`/`undefined`) и есть соблазн `synchronize: true` вместо миграций.
  MikroORM (Data Mapper, как SQLAlchemy ORM) для одной таблицы с двумя операциями избыточен.

Минус: готового индикатора для terminus нет (он есть для TypeORM, Prisma, MikroORM),
поэтому `PostgresHealthIndicator` свой — `select 1`, как `ping` у Redis.

Три представления задачи, по одному на слой:

- `AnalysisTask` (`domain/analysis-task.ts`) — доменная сущность, сервисы работают только с ней;
- `analysisTasksTable` — модель хранения, суффикс `Table` как в документации Drizzle
  (в Python — `AnalysisTaskOrm`). `TaskRepository` переводит одно в другое;
- DTO по роли: `AnalyzeRequest`, `TaskCreatedResponse`, `TaskStatusResponse` и вложенный
  `CommentResponse`. Суффикс `Schema`, как у Python-версии (`CommentSchema`), здесь не
  используется: в zod-коде он означает саму zod-схему (`commentClassificationSchema`).

Каждая операция репозитория — один SQL-оператор (`INSERT … ON CONFLICT DO UPDATE` или `SELECT`),
то есть своя короткая транзакция. Соединение берётся из пула на время запроса, поэтому
минутная обработка задачи в воркере его не держит.

**Миграции — drizzle-kit + свой скрипт.** `npm run db:generate` сравнивает схему в коде
с последним снимком и пишет SQL-файл в `drizzle/` (аналог `alembic revision --autogenerate`).
Применяет миграции `src/database/cli.ts` через `migrate()` из `drizzle-orm`, поэтому drizzle-kit
остаётся dev-зависимостью и в образ не попадает. Откатных (down) миграций у Drizzle нет.

Команды БД работают без контейнера Nest и читают только `DATABASE_URL` и `LOG_LEVEL`
(`databaseEnvSchema`): ключи YouTube и LLM для них не нужны, как `DatabaseSettings` в Python.
В Postgres нет `CREATE DATABASE IF NOT EXISTS`, поэтому `create` сначала смотрит
в `pg_database`, а гонку двух процессов (`42P04`) считает успехом.

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
- таймаут задачи 10 минут через `AbortSignal`, который доходит до `fetch` и вызовов LLM;
- в Redis лежат только служебные данные очереди: статус и результат — в Postgres. Поэтому
  завершённые джобы хранятся час (не больше 1000), упавшие — неделю для разбора (не больше 5000).
  Лимит по числу важен: общий Redis работает с `noeviction`, и разросшаяся очередь одного
  backend остановила бы запись у всех. Это константы в `analyze-video.job.ts`, а не переменные
  окружения: меняются редко.

**Соединения с Redis** (`queue/queue.module.ts`, `redis/redis.module.ts`):

- воркер: `maxRetriesPerRequest: null` (требование BullMQ к Worker) и **никакого `commandTimeout`**.
  Иначе ioredis оборвал бы блокирующее ожидание задачи (`BZPOPMIN`) на паузах в очереди.
  В Python-версии ровно так и случилось с `socket_timeout=5` в redis-py 8;
- API: `enableOfflineQueue: false`, поэтому при недоступном Redis запрос сразу получает 503, а не висит;
- клиент `REDIS_CLIENT` нужен только health-check API, с коротким `commandTimeout`. Воркер его не создаёт.

**LLM — Vercel AI SDK.** `generateText` + `Output.object({ schema })`: формат ответа задаёт
zod-схема, SDK валидирует ответ. Провайдер выбирается из `LLM_MODEL=provider:model`
(`deepseek`, `openai`, `anthropic`; новый — одна строка в `language-model.factory.ts`).
Комментарии передаются как JSON, промпт запрещает выполнять инструкции из них. Выдуманные моделью
и повторяющиеся `id` отбрасываются. Батчи идут параллельно, но не больше `LLM_CONCURRENCY`
одновременно. Первая ошибка отменяет остальные батчи.

**Логи.** `nestjs-pino`, в коде обычный `new Logger(Context)` из Nest. Процессор запускает
обработку в `PinoLogger.runInContext(..., { bindings: { task_id } })` (AsyncLocalStorage),
поэтому **все** логи задачи, включая логи клиентов YouTube и LLM, получают поле `task_id` без
передачи его руками. Ключ YouTube передаётся в заголовке `X-Goog-Api-Key`, пароли в `REDIS_URL`
и `DATABASE_URL` в логах маскируются. При старте API и воркер пишут, к каким Postgres и Redis
подключились и какую очередь используют.

## Отличия от Python-версии

|                               | Python (FastAPI)                           | Node (NestJS)                                                                       |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Сборка зависимостей           | `Depends` + `lifespan` + `app.state`       | Модули, провайдеры, DI-контейнер                                                    |
| Абстракции сервисов           | `Protocol`                                 | Интерфейсы + injection-токены                                                       |
| Валидация                     | pydantic                                   | zod (+ свой pipe)                                                                   |
| Хранение задач                | Postgres, SQLAlchemy 2 (async) + asyncpg   | Postgres, Drizzle ORM + `pg`                                                        |
| Миграции                      | Alembic                                    | drizzle-kit (генерация) + `migrate()` (применение)                                  |
| Создание базы                 | `python -m app.db.create`                  | `node dist/database/cli.js create` (`npm run db:create`)                            |
| Очередь                       | taskiq, `ListQueueBroker` (`BRPOP`)        | BullMQ: lock, stalled-recovery, попытки, `UnrecoverableError`                       |
| Задача при падении воркера    | Теряется                                   | Возвращается в очередь                                                              |
| Повтор при временной ошибке   | Нет: сразу `failed`                        | До 3 попыток, между ними статус `pending`                                           |
| Таймаут задачи                | `timeout=600` у taskiq                     | `AbortSignal`, доходит до HTTP-запросов                                             |
| Параллельность LLM            | `asyncio.gather` без ограничения           | `p-limit` (`LLM_CONCURRENCY`)                                                       |
| HTTP-клиент YouTube           | httpx + tenacity                           | встроенный `fetch` + p-retry                                                        |
| LLM                           | pydantic-ai                                | Vercel AI SDK                                                                       |
| Логи                          | `logging`, текст, `[task_id]` в сообщении  | pino, JSON, `task_id` полем через AsyncLocalStorage                                 |
| `.env`                        | Ищется в текущем каталоге                  | Ищется от файла модуля, cwd не важен                                                |
| Health                        | `{"status": "ok"}`                         | `{"status": "ok", "info": {"postgres": ..., "redis": ...}}` (формат terminus)       |
| Ошибка YouTube после повторов | `Internal error`                           | `YouTube API is temporarily unavailable`                                            |
| Тесты                         | pytest, Postgres + откат, respx, fakeredis | Vitest, Postgres + откат, фейки портов, msw, `MockLanguageModelV4`, мок `queue.add` |
| OpenAPI                       | `/docs` из коробки                         | Нет (см. «Что можно добавить»)                                                      |

Переменные окружения те же, что у Python-версии, кроме адресов. `DATABASE_URL` записан в формате
node-postgres (`postgres://app:app@localhost:5432/analysis_node`), а не SQLAlchemy
(`postgresql+asyncpg://...`); `REDIS_URL` — `redis://localhost:6379/2`.
Только в Node-версии (со значениями по умолчанию): `LLM_CONCURRENCY` (4), `WORKER_CONCURRENCY` (2), `PORT` (8000).

## API

| Метод  | Путь                                | Ответ                                                                                                            |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/analysis` `{"url": "..."}` | `202 {"task_id": "..."}`; невалидная или не-YouTube ссылка → `422`                                               |
| `GET`  | `/api/v1/analysis/{task_id}`        | `200 {"task_id", "status", "result", "error"}`; не UUID → `422`; нет задачи → `404 {"detail": "Task not found"}` |
| `GET`  | `/health`                           | `200 {"status": "ok", ...}` или `503`, если Postgres или Redis недоступен                                        |

Postgres (статусы задач) или Redis (очередь) недоступен → `503 {"detail": "Storage is unavailable"}`.
Ссылки: `youtube.com/watch?v=`, `youtu.be/<id>`, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`.

## Запуск

Нужен Node.js 24 LTS (в проекте `mise.toml`, `engines` в `package.json`); npm идёт в комплекте.
Скрипты, кроме `test`, запускаются через `npm run <имя>`.

```bash
cp .env.example .env   # заполнить YOUTUBE_API_KEY, LLM_MODEL и LLM_API_KEY
npm install
```

Redis и Postgres общие для всех реализаций, их запускают один раз из корня репозитория:

```bash
docker compose -f ../docker-compose.yml up -d   # сеть ayc-infra, localhost:6379 и :5432
```

### Локально

```bash
npm run db:prepare        # создать базу analysis_node, если её нет, и применить миграции
npm run start:api:dev     # API с перезапуском при изменениях (nest start --watch)
npm run start:worker:dev  # воркер, в отдельном терминале

# или из собранного кода:
npm run build
npm run start:api
npm run start:worker
```

`.env` находится от любого текущего каталога: `cd /tmp && node ~/…/backend-node-nest-js/dist/main.worker.js` работает.

Команды БД (`db:*` собирают проект через `nest start`; из собранного кода — `node dist/database/cli.js <команда>`):

```bash
npm run db:create     # rails db:create
npm run db:migrate    # rails db:migrate
npm run db:prepare    # rails db:prepare: create + migrate
npm run db:generate   # после изменения analysis-task.table.ts: новый SQL-файл в drizzle/
```

### Docker

```bash
docker compose -f ../docker-compose.yml up -d   # общая инфраструктура, если ещё не запущена
docker compose up --build
```

Один образ (многоэтапный `Dockerfile`: deps → build → runtime без dev-зависимостей,
пользователь `node`) и три сервиса в сети `ayc-infra`:

- `migrate` — одноразовый, `node dist/database/cli.js prepare` (аналог `rails db:prepare`);
- `api` и `worker` стартуют после его успешного завершения (`service_completed_successfully`).

У воркера `stop_grace_period: 60s`: по `SIGTERM` он дорабатывает текущие задачи.

### Консоль (аналог `rails c`)

```bash
npm run console  # nest start --entryFile repl; из собранного кода: node dist/repl.js
```

```js
> const s = get(AnalysisService)
> const task = await s.start('dQw4w9WgXcQ')                 // поставить задачу в очередь
> await s.get(task.id)                                        // статус
> await $(TaskRepository).get(task.id)                        // $() — короткий get()
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
npm test             # 80 тестов: нужен общий Postgres; Redis, YouTube и LLM не нужны
npm run lint         # ESLint (typescript-eslint strictTypeChecked) + Prettier-совместимость
npm run format:check
npm run typecheck    # tsc --noEmit, strict
```

**Тестовая база — настоящий Postgres** из общей инфраструктуры, база `analysis_node_test`
(переопределяется `TEST_DATABASE_URL`; намеренно не выводится из `DATABASE_URL`, чтобы опечатка
не очистила рабочую базу). SQLite и in-memory подмены не используются: они скрывают различия СУБД.

- `test/global-setup.ts` (globalSetup Vitest) один раз на прогон создаёт базу, если её нет,
  удаляет схему и накатывает миграции с нуля — заодно проверяя их;
- каждый тест, которому нужна база, вызывает `useTestDatabase()`: перед тестом открывается
  транзакция, после — откатывается. Эта транзакция подставляется вместо токена `DATABASE`
  (`overrideProvider(DATABASE)`), так что API, сервисы и процессор в тесте пишут в неё;
- тестовые файлы идут параллельно: незакоммиченные данные друг другу не видны;
- если Postgres не запущен, прогон останавливается одним сообщением
  `Postgres is unavailable (ECONNREFUSED). Start the shared infrastructure: …`.

Что подменяется в тестах:

- Redis → фейк с `ping()` для health-check (статусы задач в Redis больше не хранятся);
- BullMQ → объект с `add: vi.fn()` через `overrideProvider(getQueueToken('analysis'))`;
  тест проверяет аргументы. Поведение самого BullMQ (lock, повторы) — забота библиотеки;
- YouTube → `msw` перехватывает `fetch`;
- LLM → `MockLanguageModelV4` из `ai/test` и фейки портов.

Тест `test/e2e/api-queue-processor.e2e.spec.ts` проходит путь целиком: `POST` через HTTP →
забираем то, что API положил в `queue.add()` → отдаём это как `Job` процессору воркера →
`GET` возвращает `completed` с результатом. API и процессор работают с одной транзакцией теста.

Ручная проверка живого стека:

```bash
curl -X POST localhost:8000/api/v1/analysis -H 'content-type: application/json' \
     -d '{"url": "https://youtu.be/dQw4w9WgXcQ"}'
curl localhost:8000/api/v1/analysis/<task_id>
```

По логам сразу видно, где проблема: после `Task enqueued` в логах API должна появиться строка
`Received by worker` с тем же `task_id` в логах воркера. Если её нет, воркер не запущен
или слушает другой Redis/очередь (оба процесса пишут их при старте). Задачи лежат в таблице:

```bash
docker exec ayc-infra-postgres-1 psql -U app -d analysis_node \
  -c 'select id, status, error, updated_at from analysis_tasks order by created_at desc limit 5'
```

## Что можно добавить

- OpenAPI (`@nestjs/swagger`) — потребует описать zod-DTO для Swagger (например, `zod-to-openapi`).
- Bull Board — веб-интерфейс очереди, аналог Sidekiq Web.
