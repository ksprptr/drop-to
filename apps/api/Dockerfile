# Multi-stage-friendly single image, built from the monorepo root:
#   docker build -f apps/api/Dockerfile -t dropto-api .
FROM node:24-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV CI=true

# Install workspace dependencies (leveraging Docker layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build the API (generate the Prisma client first — the source imports it)
COPY apps/api ./apps/api
COPY packages/types ./packages/types

WORKDIR /app/apps/api

RUN pnpm prisma:generate
RUN pnpm run build

EXPOSE 4000
CMD ["node", "dist/main"]
