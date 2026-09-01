# Multi-stage build, run from the monorepo root:
#   docker build -f apps/web/Dockerfile -t dropto-web .
#
# NEXT_PUBLIC_* values and APP_URL are inlined at build time, so they must be passed as
# build args (Coolify: set them as build-time variables). APP_NAME is NOT one of them — it is
# read on the server at runtime, so the instance can be rebranded without a rebuild.
FROM node:24-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV CI=true
# No .git in the build context, so the root `prepare` (husky) has nothing to install.
ENV HUSKY=0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

# corepack resolves pnpm from the `packageManager` field, so the image matches the lockfile.
RUN corepack enable
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/types ./packages/types
# Root tsconfig that apps/web/tsconfig.json extends.
COPY tsconfig.base.json ./

ARG NEXT_PUBLIC_GOOGLE_API_KEY
ARG NEXT_PUBLIC_GOOGLE_APP_ID
# Public origin, baked into the prerendered SEO metadata (canonical / OpenGraph URLs).
ARG APP_URL
ENV NEXT_PUBLIC_GOOGLE_API_KEY=$NEXT_PUBLIC_GOOGLE_API_KEY
ENV NEXT_PUBLIC_GOOGLE_APP_ID=$NEXT_PUBLIC_GOOGLE_APP_ID
ENV APP_URL=$APP_URL

WORKDIR /app/apps/web
RUN pnpm run build

# ---- Runner ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone output (includes a minimal node_modules + server.js), owned by the non-root user
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

# Drop privileges: run the server as the unprivileged `node` user shipped in the base image.
USER node

EXPOSE 3000

# 127.0.0.1, not localhost: that also resolves to ::1, which the IPv4 listener refuses.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
