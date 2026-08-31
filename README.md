# DropTo

> Self-hosted file uploader that routes uploads through **your own** storage backends — Google Drive
> or any S3-compatible bucket — instead of your app server's disk.

- [Prerequisites](#prerequisites)
- [Features](#features)
- [Projects](#projects)
- [Installation](#installation)
- [Run](#run)
- [Docker](#docker)
- [Configuration](#configuration)
- [Connecting storage](#connecting-storage)
- [Deployment](#deployment)
- [License](#license)

## Prerequisites

- Node.js 22+ ([Download](https://nodejs.org/en/download/)) — only for running the apps natively
- Package manager ([pnpm (recommended)](https://pnpm.io/installation), npm, ...)
- [Docker](https://docs.docker.com/get-started/get-docker/) (Docker Desktop, Colima, ...) — required
  for the database, and the simplest way to run the whole stack
- IDE ([VS Code](https://code.visualstudio.com/), WebStorm, ...)
- A Google Cloud project (to connect a Google Drive) and/or S3 credentials — see
  [Connecting storage](#connecting-storage)

## Features

- **Your storage, not the server's disk** — uploads are streamed straight through to Google Drive or
  an S3-compatible bucket (AWS S3, MinIO, Cloudflare R2, ...); nothing is buffered on disk
- **Finder-like workspace** — a three-pane browser (storage sidebar, file list, preview) with a
  split view, sorting, search, breadcrumbs, deep links and image previews
- **Drag & drop uploads** — whole folder trees, with duplicate handling (replace / keep both /
  cancel), per-file progress and ETA in a floating upload dock, and abortable transfers sized by
  `MAX_UPLOAD_BYTES`
- **Storage switcher** — browse Google Drive and S3 side by side and move between them in one click
- **Folder-scoped Drive access** — the owner authorizes specific folders through the Google Picker,
  and every single Drive call is validated server-side (ancestor walk) to stay inside that tree;
  the authorized roots themselves cannot be deleted
- **Single-operator auth** — username/password from the env, JWT access tokens plus rotating,
  DB-backed refresh tokens in httpOnly cookies, with reuse detection
- **Secrets stay encrypted** — the Drive refresh token is AES-256-GCM encrypted in Postgres and the
  browser never talks to Google (or the API) directly; everything goes through the Next.js BFF
- **Hardened by default** — a strict CSP and security headers, an IP-keyed rate limiter, read-only
  containers running as a non-root user
- **Rebrandable** — set `APP_NAME` and the whole app, its titles and its link previews follow

## Projects

| Name                       | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| [web](./apps/web/)         | Next.js front-end — login, workspace, Google Picker setup; the BFF layer |
| [api](./apps/api/)         | NestJS API — operator auth, Google OAuth, storage providers, uploads     |
| [types](./packages/types/) | `@dropto/types` — the shared API contract between the two                |

## Installation

1. Clone the repository and navigate to the root: `cd drop-to/`
2. Install all dependencies: `pnpm install`
3. Create the env files and adjust the values:

```bash
cp .env.example .env                        # infrastructure + web (docker compose reads this)
cp apps/api/.env.example apps/api/.env      # API secrets
cp apps/web/.env.example apps/web/.env      # only for running the web app natively
```

> In the Docker deployment the web app gets its settings from compose, so `apps/web/.env` is only
> needed when you run `pnpm dev` / `pnpm build` directly.

4. Generate the two secrets the API needs and paste them into `apps/api/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"        # TOKEN_ENCRYPTION_KEY
```

5. Set `AUTH_USERNAME` / `AUTH_PASSWORD` in `apps/api/.env` — that is the account you log in with.

From here, either run everything in Docker ([Docker](#docker), recommended) or run the apps natively
([Run](#run)).

## Run

Native development, with only the infrastructure in Docker:

```bash
docker compose up -d dropto-pg dropto-redis   # infrastructure only — builds no app image
pnpm --filter api run prisma:migrate:deploy   # first run only
pnpm dev                                      # api :4000, web :3000
```

Other scripts (run from the monorepo root):

- Production build: `pnpm build`
- Lint: `pnpm lint`
- Tests: `pnpm test`
- Format: `pnpm format`

> Run every `docker compose` and `pnpm` command from the monorepo root.

## Docker

The full stack — Postgres, Redis, the API and the web app — is one command. Both apps ship a
multi-stage `Dockerfile` (Nest `dist` / Next.js standalone output, non-root user, health checks) and
the compose file wires them together.

```bash
cp .env.example .env                    # if you have not already
cp apps/api/.env.example apps/api/.env  # compose overrides DB_*/REDIS_* from the root .env
docker compose up -d --build            # http://localhost:3000
docker compose logs -f dropto-web       # stream logs for a service
docker compose down                     # stop; the volumes keep your data
```

Database migrations run **automatically** on every `up`: the one-shot `dropto-migrate` service
applies them and the API only starts once it has exited successfully.

> **Give the Docker VM enough memory.** The API image compiles TypeScript against the large
> `googleapis` type surface and needs ~4 GiB for `tsc` — allocate **at least ~6 GiB** to the VM or
> the build can OOM. With Colima: `colima start --cpu 4 --memory 8`.

Building the images without compose:

```bash
docker build -f apps/api/Dockerfile -t dropto-api .
docker build -f apps/web/Dockerfile -t dropto-web . \
  --build-arg APP_URL=https://dropto.example.com \
  --build-arg NEXT_PUBLIC_API_URL=https://api.dropto.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_GOOGLE_API_KEY=... \
  --build-arg NEXT_PUBLIC_GOOGLE_APP_ID=...
```

`APP_URL` and every `NEXT_PUBLIC_*` value is inlined at **build time** (they feed the browser bundle
and the prerendered metadata), so pass them as build args for any non-localhost deployment and keep
the runtime values identical. Everything else — including `APP_NAME` — is read at runtime, so
renaming the instance or repointing the API needs no rebuild.

The compose file binds every published port to `127.0.0.1` (the containers are meant to sit behind a
reverse proxy on the same host); drop that prefix in `docker-compose.yml` to expose them on the
network directly — for example to open the workspace from your phone.

## Configuration

| App     | Port | Technologies             | URL                                                              |
| ------- | ---- | ------------------------ | ---------------------------------------------------------------- |
| **web** | 3000 | Next.js, React, Tailwind | http://localhost:3000 · health: http://localhost:3000/api/health |
| **api** | 4000 | NestJS, Prisma           | http://localhost:4000 · health: http://localhost:4000/health     |

> Swagger is served at http://localhost:4000/swagger in development only.

> Infrastructure

| Description      | Values                              |
| ---------------- | ----------------------------------- |
| **Ports:**       | 5432 (Postgres 17), 6379 (Redis 7)  |
| **Credentials:** | `root:password`, `default:password` |

### Root `.env` — infrastructure + web

| Variable                                           | Description                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `DB_*`                                             | Postgres name / user / password; creates the DB **and** is handed to the API            |
| `REDIS_*`                                          | Redis password, user and key prefix (the rate limiter's store)                          |
| `APP_URL`                                          | Public origin of the web app — canonical / OpenGraph / manifest URLs. **Build time**    |
| `NEXT_PUBLIC_API_URL`                              | Public API base; used by the browser only for the Google OAuth redirect. **Build time** |
| `COOKIE_DOMAIN`                                    | Auth-cookie domain; a shared parent domain in production                                |
| `APP_NAME`                                         | Display name of the instance (optional, default `DropTo`). Runtime                      |
| `NEXT_PUBLIC_GOOGLE_API_KEY` / `_APP_ID`           | Google Picker API key and project number. **Build time**                                |
| `WEB_PORT` / `API_PORT` / `DB_PORT` / `REDIS_PORT` | Host ports the containers publish on (compose only)                                     |

### `apps/api/.env` — API

| Variable                                                                               | Description                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `APP_PORT`, `NODE_ENV`                                                                 | Listen port and environment                                                     |
| `WEB_APP_URL`, `CORS_ALLOWED_ORIGINS`                                                  | Where the web app lives, and who may call the API                               |
| `COOKIE_DOMAIN`, `TRUST_PROXY_HOPS`                                                    | Cookie domain; trusted proxy hops, so the rate limiter sees the real IP         |
| `JWT_ACCESS_SECRET`                                                                    | Signs access tokens (refresh tokens are opaque, hashed in the DB)               |
| `TOKEN_ENCRYPTION_KEY`                                                                 | 64 hex chars — AES-256-GCM key for the stored Drive refresh token               |
| `AUTH_USERNAME`, `AUTH_PASSWORD`                                                       | The single operator account you log in with                                     |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI`                                       | Google OAuth client for the Drive owner                                         |
| `S3_ENABLED` (+ `S3_BUCKETS`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) | S3 backend; `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` for MinIO / R2                |
| `MAX_UPLOAD_BYTES`, `OFFLINE_TIMEOUT_MS`                                               | Upload size cap and how long a dropped connection may stall                     |
| `RATE_LIMIT_ENABLED`                                                                   | Kill switch for the global rate limiter                                         |
| `DB_*`, `REDIS_*`                                                                      | Only needed when running natively — compose overrides them from the root `.env` |

## Connecting storage

### Google Drive (one-time Google Cloud setup)

1. Create a Google Cloud project — note the **project number**, it is the Picker `App ID`
   (`NEXT_PUBLIC_GOOGLE_APP_ID`).
2. Enable the **Google Drive API** and the **Google Picker API**.
3. Configure the OAuth consent screen (External), add the scope
   `https://www.googleapis.com/auth/drive` and add the Drive owner's email as a test user.
4. Create an **OAuth client ID** (Web application):
   - Authorized redirect URI: `<API URL>/api/v1/google-auth/google/callback`
   - Authorized JavaScript origin: the web app's URL

   → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `apps/api/.env`.

5. Create an **API key** restricted to the Picker API → `NEXT_PUBLIC_GOOGLE_API_KEY`.
6. Start the app, log in, and use **Connect Drive** in the sidebar. The owner picks the folders to
   share; those become the only folders the app will touch.

> **A note on the scope.** DropTo asks for the full `.../auth/drive` scope rather than the
> per-file `drive.file`, because `drive.file` cannot see files that were added to a folder
> _directly in Drive_ — only ones the app created or the Picker handed it, which makes a shared
> folder look half-empty. The trade-off is that the grant covers the owner's whole Drive and the
> confinement to the authorized folders is enforced by the API alone, on every request.

> **Publish the app, or Drive keeps disconnecting.** While the consent screen sits in **Testing**,
> Google expires the refresh token after **7 days** and the workspace shows "Your Google Drive was
> disconnected". Hit **Publish app** (publishing status → _In production_) and the expiry is gone.
> Verification is **not** needed for this: it is only mandatory for _public_ apps using
> sensitive/restricted scopes. Staying unverified in production costs a one-time "Google hasn't
> verified this app" screen (→ _Advanced_ → _Go to app_), a cap of 100 users and no app name/logo on
> the consent screen — all irrelevant for a single-owner instance. Chasing verified status is not
> worth it: `.../auth/drive` is a _restricted_ scope, which pulls in an annual third-party CASA
> security assessment.

### S3 / S3-compatible

Set `S3_ENABLED="true"` in `apps/api/.env` and fill in `S3_BUCKETS` (a comma-separated list — each
bucket becomes a browse root), `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. For MinIO,
Cloudflare R2 and friends, also set `S3_ENDPOINT` and usually `S3_FORCE_PATH_STYLE="true"`. No UI
step is needed — the buckets show up in the sidebar on the next load.

## Deployment

DropTo is **self-hosted** — you run it on your own infrastructure, at whatever domain(s) you choose.
There is no fixed or official URL.

Run the bundled compose stack behind a reverse proxy / TLS of your choice (Caddy, Traefik, nginx,
Coolify, Cloudflare Tunnel, ...) and point the env vars at wherever you host it:

- `APP_URL` → the public web origin (e.g. `https://dropto.example.com`) — **build arg**
- `NEXT_PUBLIC_API_URL` → the public API base (e.g. `https://api.dropto.example.com/api/v1`) —
  **build arg**, because the browser is redirected there during the Google OAuth flow
- `WEB_APP_URL` and `CORS_ALLOWED_ORIGINS` (API) → the same public web origin
- `COOKIE_DOMAIN` → a shared parent of both hosts (e.g. `.example.com`), so the web app and the API
  can read the same auth cookies
- `GOOGLE_REDIRECT_URI` → `<public API URL>/api/v1/google-auth/google/callback`, and the same value
  in the Google Cloud OAuth client
- `TRUST_PROXY_HOPS` → the number of proxies in front of the API, so the rate limiter keys on the
  real client IP

> **Serve it over HTTPS.** With `NODE_ENV=production` the auth cookies are issued as `Secure`, so a
> browser will only store them on an `https://` origin — plus `http://localhost`, which browsers
> treat as a secure context. Behind plain http on a LAN IP or a real domain, logging in silently
> fails: the login call succeeds and the cookies are dropped. Terminate TLS at your reverse proxy.

The images expose health checks (`/api/health` on the web app, `/health` on the API) for the
platform's probes, and both run as a non-root user with a read-only root filesystem.

## License

> This software is developed by **Petr Kašpar** and is licensed under the MIT License.  
> For more details, please refer to the [LICENSE](./LICENSE) file.
