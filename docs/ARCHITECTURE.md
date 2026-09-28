# Dogfood 2026 Architecture

Offline-first Next.js App Router application with PostgreSQL/Drizzle for durable state and SeaweedFS for local object storage. API boundaries validate input with Zod, sessions are opaque and revocable, and event phases are derived from server timestamps.

The `docker-compose.yml` file provides the complete local runtime: app, Postgres, and SeaweedFS. A single `docker compose up` builds the image (`npm ci` + `next build`), migrates, seeds, and smoke-proves the CLI via one-shot `seed`/`cli` services — no local `npm install` or extra commands needed. The test suite is not run on boot; run it with zero setup via `docker compose run --rm cli npm test`.
