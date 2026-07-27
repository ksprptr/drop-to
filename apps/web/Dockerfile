# Multi-stage build, run from the monorepo root:
#   docker build -f apps/web/Dockerfile -t dropto-web .
#
# NEXT_PUBLIC_* values are inlined at build time, so they must be passed as
# build args (Coolify: set them as build-time variables).
FROM node:24-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/types ./packages/types

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_API_KEY
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_APP_ID
# Public origin, baked into the prerendered SEO metadata (canonical / OpenGraph URLs).
ARG APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_API_KEY=$NEXT_PUBLIC_GOOGLE_API_KEY
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
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

# Standalone output (includes a minimal node_modules + server.js)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
