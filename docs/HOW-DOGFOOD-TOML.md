# HOW: `.dogfood.toml` on a clean install / docker build

**It is generated.** `scripts/write-dogfood-toml.ts` (`pnpm dogfood:toml`)
mints fresh sessions for the four checker roles against the real seeded rows
and writes `.dogfood.toml` — then prints the same block for `docker compose
up` logs. The copy committed in this repo is only valid for the database
that generated it; any reseed or fresh install needs a fresh one.

## Why it must be generated per install

The file embeds values that are random or install-specific:

- `[auth]` cookies are `dogfood_session` token values. Sessions are created
  with random tokens (`createSession` in `src/server/auth-service.ts`) and
  expire after 7 days (`SESSION_TTL_MS`), so they differ on every install.
- `[routes]` UUIDs (fixture event id, judge-A user id) belong to rows in
  that install's database.

## What the generator does

1. Finds the fixture event (`sample-hack-2026` from `src/db/fixtures.json`).
2. Grants `organizer@local` an `ORGANIZER` mapping on it (idempotent —
   the checker exports that event as the organizer).
3. Picks the first two fixture judges in load order (both hold `JUDGE`
   mappings plus real scores on the fixture event).
4. Mints sessions for organizer, judge A, judge B, and `participant@local`.
5. Writes `.dogfood.toml` (base URL from `DOGFOOD_BASE_URL`, default
   `http://localhost:3000`) and prints it.

## Which install path runs it

- `docker compose up`: the one-shot `seed` service runs
  `db:migrate && db:seed && db:fixtures && dogfood:toml`. The file lands
  inside the container, so **copy the printed block from the seed logs**
  into repo-root `.dogfood.toml` — the spec's "Priya" step. Refresh any
  time with `docker compose run --rm seed` (sessions expire after 7 days).
- Local dev: `pnpm db:seed && pnpm db:fixtures && pnpm dogfood:toml`
  writes the repo-root file directly (needs Postgres reachable per
  `.env.example`).

Then run the checker:

```
python3 scripts/run.py .dogfood.toml > acceptance-report.txt
```

No `--fixtures` flag is needed: repo-root `fixtures.json` is a symlink
to `src/db/fixtures.json`, placed there because `run.py` only searches
the working directory, its own folder, and the config's folder for its
answer key (the expected project titles for the gallery check). The
symlink keeps a single source of truth — the database remains the only
thing the portal itself ever reads; the checker just needs the file to
know what to look for. If the symlink is ever missing, that check fails
with "no fixture file was loaded" no matter what the gallery serves.
