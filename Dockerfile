FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS test
COPY . .
RUN pnpm run typecheck && pnpm test

FROM deps AS dev
COPY . .
CMD ["pnpm", "run", "start", "--", "--dry-run"]
