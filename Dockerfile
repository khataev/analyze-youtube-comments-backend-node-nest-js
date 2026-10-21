# syntax=docker/dockerfile:1

# --- base: Node LTS (npm входит в образ) ---
FROM node:24-alpine AS base
WORKDIR /app

# --- deps: только зависимости; слой кэшируется, пока не меняется lock-файл ---
FROM base AS deps
COPY package.json package-lock.json ./
# npm ci — установка строго по lock-файлу (аналог bundle install --frozen / pip install -r с хешами)
RUN --mount=type=cache,target=/root/.npm npm ci

# --- build: компиляция TypeScript, затем удаляем dev-зависимости ---
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY drizzle ./drizzle
RUN npm run build && npm prune --omit=dev

# --- runtime: только node_modules для прода, собранный dist и SQL-миграции ---
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 8000
# Один образ для API, воркера и миграций: команду переопределяет docker-compose.yml
CMD ["node", "dist/main.api.js"]
