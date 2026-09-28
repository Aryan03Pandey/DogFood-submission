# Dogfood 2026 Architecture

Offline-first Next.js App Router application with PostgreSQL/Drizzle for durable state and SeaweedFS for local object storage. API boundaries validate input with Zod, sessions are opaque and revocable, and event phases are derived from server timestamps.

The `docker-compose.yml` file provides the complete local runtime: app, Postgres, SeaweedFS, and a `webhook-worker` background process (Tier 4.5). A single `docker compose up` builds the image (`npm ci` + `next build`), migrates, seeds, and smoke-proves the CLI via one-shot `seed`/`cli` services — no local `npm install` or extra commands needed. The test suite is not run on boot; run it with zero setup via `docker compose run --rm cli npm test`.

`webhook-worker` reuses the `app` image (no second build) and polls a Postgres-backed outbox (`webhook_deliveries`) for HMAC-signed deliveries to organizer-registered endpoints; with no endpoints registered (the default) it makes zero outbound calls, keeping the whole stack `OFFLINE_MODE`-compatible without special-casing. It's the only long-running process besides `app` — everything else in this file is a one-shot command.
