# DropTo

> Self-hosted file uploader that routes uploads through **your own** storage backends — Google Drive
> or any S3-compatible bucket — instead of your app server's disk.

- [Features](#features)
- [Projects](#projects)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Run](#run)
- [Connecting storage](#connecting-storage)
- [Deployment](#deployment)
- [License](#license)

## Features

- Uploads stream straight through to Google Drive or S3 (AWS, MinIO, Cloudflare R2); nothing is
  buffered on disk
- Finder-like workspace — three panes, split view, search, breadcrumbs, deep links, image previews
- Drag & drop whole folder trees, with duplicate handling, progress and ETA
- Drive access is folder-scoped: the owner picks folders through the Google Picker and every call is
  validated server-side to stay inside them
- Single-operator auth — JWT access tokens plus rotating, DB-backed refresh tokens in httpOnly
  cookies, with reuse detection
- The Drive refresh token is AES-256-GCM encrypted in Postgres; the browser never talks to Google or
  the API directly
- Strict CSP, IP-keyed rate limiting, read-only non-root containers
- Rebrandable through `APP_NAME`

## Projects

| Name                       | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| [web](./apps/web/)         | Next.js front-end — login, workspace, Google Picker setup; the BFF layer |
| [api](./apps/api/)         | NestJS API — operator auth, Google OAuth, storage providers, uploads     |
| [types](./packages/types/) | `@dropto/types` — the shared API contract between the two                |

## Prerequisites

- Node.js 24+ and pnpm 11+ — only for running the apps natively
- [Docker](https://docs.docker.com/get-started/get-docker/) — required for the database, and the
  simplest way to run the whole stack
- A Google Cloud project and/or S3 credentials — see [Connecting storage](#connecting-storage)

## Setup

```bash
pnpm install

cp .env.example .env                        # infrastructure + web (compose reads this)
cp apps/api/.env.example apps/api/.env      # API
cp apps/web/.env.example apps/web/.env      # only for running the web app natively
```

Every variable is documented inline in those `.env.example` files.

Generate the two API secrets and paste them into `apps/api/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"        # TOKEN_ENCRYPTION_KEY
```

Set `AUTH_USERNAME` / `AUTH_PASSWORD` — that is the account you log in with.

## Run

Everything in Docker (recommended):

```bash
docker compose up -d --build   # http://localhost:3000
docker compose logs -f dropto-web
docker compose down            # volumes keep your data
```

Migrations run automatically — the one-shot `dropto-migrate` service applies them and the API waits
for it.

> Give the Docker VM at least ~6 GiB. The API image compiles TypeScript against the large
> `googleapis` type surface and can OOM below that. Colima: `colima start --cpu 4 --memory 8`.

Natively, with only the infrastructure in Docker:

```bash
docker compose up -d dropto-pg dropto-redis
pnpm --filter api run prisma:migrate:deploy   # first run only
pnpm dev                                      # api :4000, web :3000
```

Other scripts from the root: `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm format`.

| App     | Port | Health                           |
| ------- | ---- | -------------------------------- |
| **web** | 3000 | http://localhost:3000/api/health |
| **api** | 4000 | http://localhost:4000/health     |

Swagger is served at http://localhost:4000/swagger in development only.

## Connecting storage

### Google Drive

One-time Google Cloud setup:

1. Create a project — the **project number** is the Picker `App ID` (`NEXT_PUBLIC_GOOGLE_APP_ID`).
2. Enable the **Google Drive API** and the **Google Picker API**.
3. OAuth consent screen (External): add the scope `https://www.googleapis.com/auth/drive` and the
   Drive owner's email as a test user.
4. Create an **OAuth client ID** (Web application):
   - Authorized redirect URI: `<web origin>/api/oauth/google/callback`
   - Authorized JavaScript origin: the web app's URL
5. Create an **API key** restricted to the Picker API → `NEXT_PUBLIC_GOOGLE_API_KEY`.
6. Log in and use **Connect Drive** in the sidebar. The folders the owner picks are the only ones the
   app will ever touch.

> **Publish the app, or Drive keeps disconnecting.** While the consent screen sits in _Testing_,
> Google expires the refresh token after 7 days. Hit **Publish app** and the expiry is gone —
> verification is not required for a single-owner instance.

DropTo asks for the full `.../auth/drive` scope because `drive.file` cannot see files added to a
folder directly in Drive. The grant therefore covers the owner's whole Drive, and the confinement to
the authorized folders is enforced by the API on every request.

### S3 / S3-compatible

Set `S3_ENABLED="true"` and fill in the `S3_*` variables in `apps/api/.env`. Each bucket in
`S3_BUCKETS` becomes a browse root. For MinIO and R2 also set `S3_ENDPOINT` and usually
`S3_FORCE_PATH_STYLE="true"`. No UI step — the buckets appear in the sidebar on the next load.

## Deployment

Run the compose stack behind a reverse proxy of your choice (Caddy, Traefik, nginx, Coolify,
Cloudflare Tunnel) and point these at your domain:

- `APP_URL` and the `NEXT_PUBLIC_*` values — **build args**, inlined into the bundle
- `WEB_APP_URL`, `CORS_ALLOWED_ORIGINS` (API) — the public web origin
- `GOOGLE_REDIRECT_URI` — `<public web origin>/api/oauth/google/callback`, same value in the Google
  Cloud OAuth client
- `API_URL` (web) — the API's internal address, e.g. `http://dropto-api:4000/api/v1`
- `TRUST_PROXY_HOPS` — proxies in front of the API, so the rate limiter keys on the real client IP
- `COOKIE_DOMAIN` — **leave unset**; cookies stay host-only on the web origin

**The API needs no public route.** Every browser request goes to the web app, which reaches the API
server-to-server over the compose network — including both legs of the Google OAuth handshake.

> **Serve it over HTTPS.** With `NODE_ENV=production` the auth cookies are `Secure`, so a browser
> stores them only on `https://` origins (plus `http://localhost`). Behind plain http, login
> silently fails — the request succeeds and the cookies are dropped.

Compose binds every published port to `127.0.0.1`, expecting a reverse proxy on the same host; drop
that prefix in `docker-compose.yml` to expose them directly.

## License

> This software is developed by **Petr Kašpar** and is licensed under the MIT License.  
> For more details, please refer to the [LICENSE](./LICENSE) file.
