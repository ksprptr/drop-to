# DropTo

> Self-hosted file uploader that lets you route uploads through your own storage backends (Google Drive, S3, and more) instead of your app server's disk.

- [Prerequisites](#Prerequisites)
- [Dependencies](#Dependencies)
- [Projects](#Projects)
- [Installation](#Installation)
- [Run](#Run)
  - [Docker](#Docker)
- [Configuration](#Configuration)
- [Deployment](#Deployment)
- [License](#License)

## Prerequisites

- Node.js 22+ ([Download](https://nodejs.org/en/download/))
- Container runtime ([Docker (recommended)](https://www.docker.com/), Colima, ...)
- IDE ([VS Code](https://code.visualstudio.com/), WebStorm, ...)
- Package manager ([pnpm (recommended)](https://pnpm.io/installation), npm, ...)

## Dependencies

- **Postgres** _(started automatically via docker compose)_

## Projects

| Name               | Description                                           |
| ------------------ | ----------------------------------------------------- |
| [web](./apps/web/) | Next.js front-end — setup page + uploader UI          |
| [api](./apps/api/) | NestJS API — Google OAuth, Drive integration, uploads |

## Installation

1. Clone the repository and navigate to the root: `cd drop-to/`
2. Install all dependencies: `pnpm install`
3. Copy `.env.example` to `.env` in the monorepo root and in each app directory (`apps/web/`, `apps/api/`) and adjust the values accordingly.
4. Start required services: `docker compose -f docker-compose.infra.yml up -d`
   > Run all docker compose commands from the monorepo root.
5. **First run only:** Apply database migrations and generate Prisma client: `pnpm --filter api prisma:migrate && pnpm --filter api prisma:generate`
6. Start all services (see [Run](#Run) section).

## Run

- Development mode (native): `pnpm dev`
- Production mode (native): `pnpm build && pnpm start`
- Production mode (Docker): see [Docker](#Docker) section

### Docker

Alternatively, you can run each project in a Docker container (recommended for production):

1. Copy `.env.example` to `.env` in the monorepo root and in each app directory (`apps/web/`, `apps/api/`) and adjust the values accordingly.
2. Build the images: `docker compose build`
   > Run all docker compose commands from the monorepo root.
3. **First run only:** Start infrastructure, apply migrations, then start all services:

```bash
   docker compose up -d dropto-pg
   docker compose run --rm --no-deps dropto-api pnpm prisma:migrate:deploy
   docker compose up -d
```

4. **Subsequent runs:** `docker compose up -d`

## Configuration

> Web

| Description       | Values                |
| ----------------- | --------------------- |
| **Port:**         | 3000                  |
| **Technologies:** | Next.js               |
| **URL:**          | http://localhost:3000 |

> API

| Description       | Values                        |
| ----------------- | ----------------------------- |
| **Port:**         | 4000                          |
| **Technologies:** | NestJS, Google Drive API      |
| **URL:**          | http://localhost:4000         |
| **Swagger:**      | http://localhost:4000/swagger |

> Database

| Description       | Values          |
| ----------------- | --------------- |
| **Ports:**        | 5432            |
| **Technologies:** | Postgres        |
| **Databases:**    | postgres        |
| **Credentials:**  | `root:password` |

## Deployment

DropTo is **self-hosted** — you run it on your own infrastructure, at whatever domain(s) or host/port you choose, routing uploads to whatever storage you want (connect any Google Drive via the setup flow and/or configure your own S3 buckets in the API env). There is **no fixed or official URL**.

Deploy the full stack (web + api + Postgres + Redis) with the bundled compose file (`docker compose up -d`, see [Docker](#Docker)) behind a reverse proxy / TLS of your choice (Caddy, Traefik, nginx, Coolify, Cloudflare Tunnel, …). Everything URL-related is driven by env vars, so point them at wherever you host:

## License

> This software is developed by **Petr Kašpar** and is licensed for non-commercial use only.  
> Commercial use is prohibited without permission.  
> For more details, please refer to the [LICENSE](./LICENSE) file.
