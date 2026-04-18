# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV PORT=3001

COPY . /app

EXPOSE 3001

CMD ["bun", "src/index.ts"]
