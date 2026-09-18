# Upgrading Postgres

The bundled database is **Postgres 18** (`POSTGRES_VERSION` in the root `.env`; 17 still works if
you pin it).

Postgres never opens a data directory written by a different major version, so moving an existing
instance from 17 to 18 is a **dump and restore**, not a version bump. If you just change the number,
the container refuses to start with `database files are incompatible with server` — your data is
untouched, but nothing comes up until you either restore properly or pin the version back.

A fresh install needs none of this: the first `docker compose up` initializes the cluster on
whatever version is configured.

## Upgrade

Everything below runs from the repo root, with the stack currently on the **old** version.

```bash
# 1. Stop the apps so nothing writes during the dump; leave the database running.
docker compose stop dropto-web dropto-api

# 2. Dump the database (reads DB_USER / DB_NAME from your root .env).
source .env
docker compose exec -T dropto-pg pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists > dropto-backup.sql

# 3. Sanity-check the dump BEFORE deleting anything — it must be non-empty and end with a complete
#    statement. No file, no upgrade.
tail -n 3 dropto-backup.sql && ls -lh dropto-backup.sql

# 4. Remove the old cluster. `-v` drops the project's volumes, which is exactly the point: the new
#    major needs an empty data directory. (The Redis volume goes too — it only holds rate-limit
#    counters, nothing to preserve.)
docker compose down -v

# 5. Bump POSTGRES_VERSION in .env (e.g. 17 -> 18), then start the new database alone.
docker compose up -d dropto-pg

# 6. Restore into the database the entrypoint just created.
docker compose exec -T dropto-pg psql -U "$DB_USER" -d "$DB_NAME" < dropto-backup.sql

# 7. Bring the rest back up. `dropto-migrate` finds every migration already applied and exits.
docker compose up -d --build
```

## After the upgrade

Verify before deleting the dump: log in, and check that the storage sidebar still shows the
connected Google account and its authorized folders.

Keep `dropto-backup.sql` until you are satisfied — it is the only copy of that state. It is
gitignored, but it still contains the Drive refresh token (encrypted) and every session row, so
delete it once the upgrade is done rather than leaving it around.

## What is actually at stake

The database holds the connected Drive account (its encrypted refresh token) and the folders
authorized through the Picker, plus refresh-token sessions. Your files live in Drive and S3 and are
never touched by any of this: the worst case of losing the database is reconnecting Drive,
re-picking the folders, and everyone being logged out.

## Postgres managed outside compose

If your Postgres runs as a Coolify service, RDS, or any managed provider, the same dump and restore
applies — run it against that service instead, using whatever upgrade path it documents. Only steps
4 and 5 are compose-specific.
