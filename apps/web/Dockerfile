# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN bun x turbo run build --filter=web

FROM oven/bun:1.3.1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/web/.output ./.output

EXPOSE 3000

CMD ["bun", ".output/server/index.mjs"]
