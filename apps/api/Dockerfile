# Multi-stage build, run from the monorepo root:
#   docker build -f apps/api/Dockerfile -t dropto-api .
#
# The runner ships production dependencies only (no @nestjs/cli, typescript, jest,
# eslint, ...) plus the compiled dist and the Prisma schema/migrations needed by
# `prisma migrate deploy` (run from this image at deploy time).

# ---- Builder: full deps + Prisma client + compiled dist ----
FROM node:24-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app
ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages/types ./packages/types

WORKDIR /app/apps/api

# prisma generate loads prisma.config.ts, whose datasource url is templated from DB_* — it doesn't
# connect, so build-time placeholders suffice; real values come from env_file at runtime.
ENV DB_USER=build DB_PASS=build DB_HOST=localhost DB_PORT=5432 DB_NAME=build

RUN pnpm prisma:generate

# tsc needs headroom here (the googleapis type surface is large and OOMs the default ~1 GiB
# old-space). Requires a build host / Docker VM with >= ~4 GiB RAM.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm run build

# ---- Runner: production dependencies + built artifacts only ----
FROM node:24-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app
ENV CI=true
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

RUN npm install -g pnpm
# Production dependencies only (Prisma CLI is a runtime dep — migrations run here).
RUN pnpm install --frozen-lockfile --prod

# Built app + the Prisma schema/migrations/config that `migrate deploy` reads.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src/prisma ./apps/api/src/prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

WORKDIR /app/apps/api

# Drop privileges: run as the unprivileged `node` user shipped in the base image.
USER node

EXPOSE 4000
CMD ["node", "dist/main"]
