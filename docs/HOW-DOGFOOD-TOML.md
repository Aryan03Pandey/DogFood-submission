# HOW: `.dogfood.toml` on a clean install / docker build

Short answer: **nothing generates it.** No Dockerfile step, no compose
service, and no seed script writes `.dogfood.toml`. It is a hand-built,
per-environment file (the spec calls this the "Priya copies those into a
file" step — see `docs/spec.md`, "File 1: `.dogfood.toml`"). The copy
committed in this repo only works against this dev database.

## Why it can't be copied between installs

The file embeds values that are random or install-specific:

- `[auth]` cookies are `dogfood_session` token values. Sessions are created
  at login with random tokens, so they differ on every install and expire.
- `[routes]` UUIDs (event id, judge id) belong to rows in that install's
  database. The event id in the committed file was created ad-hoc in this
  dev DB — it appears in neither `src/db/fixtures.json` nor any seed
  script, so no fresh install will ever contain it.

## What each install path gives you

- `docker compose up` (dev compose): a one-shot service runs
  `db:migrate && db:seed && db:fixtures`. You get deterministic demo
  accounts (`admin@local`, `organizer@local`, `judge1@local`,
  `participant@local`, all sharing the documented dev password in
  `scripts/seed.ts`) plus fixture data — but sessions and row UUIDs are
  still fresh per install.
- Production `docker build` image (`Dockerfile` CMD): applies pending
  migrations only, then starts Next.js on an **empty** database. Create
  users, events, and roles through the UI or CLI first.

## Regenerating the file for a new environment

1. Boot the stack and log in through the UI once per role you need
   (`organizer`, two judges, one participant — note the seed only creates
   one judge account, so invite/create the second).
2. Copy each role's `dogfood_session` cookie value into `[auth]`.
3. Pick the event (console URL or `/api/events`) and the judge id for the
   peer-scores probe, and fill in `[routes]`.
4. Set `[portal] base_url` and honest `[tiers] claimed` values.
5. Run the checker with fixtures:
   `python3 scripts/run.py .dogfood.toml --fixtures src/db/fixtures.json`

If the DB is ever reset or reseeded, repeat from step 1 — the old cookies
and UUIDs are dead.
