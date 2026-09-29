# Dogfood 2026 — self-hostable hackathon submission and judging platform

Built as an entry to the Dogfood 2026 hackathon: the competition's portal,
judged partly by an automated checker (`scripts/run.py`) against
`.dogfood.toml` and the shared `src/db/fixtures.json` data. See
`docs/spec.md` for the grading contract and `docs/REQUIREMENTS.md` for the
full feature tiers.

## Quickstart (graded path)

```bash
docker compose up
```

That alone boots Postgres + SeaweedFS, migrates, seeds demo users and
fixture data, and prints a fresh `.dogfood.toml` block from the seed logs —
copy it to repo-root `.dogfood.toml` (sessions are random per install and
expire after 7 days; see `docs/HOW-DOGFOOD-TOML.md`). The portal serves on
`http://localhost:3000`. No network access, cloud accounts, or external APIs
are needed.

Seeded dev accounts (password `DogfoodLocal1!` for all):

| Email | Global role | On the `dogfood-2026` event |
|---|---|---|
| `admin@local` | SUPERADMIN | everything |
| `organizer@local` | PARTICIPANT | ORGANIZER |
| `judge1@local` | PARTICIPANT | JUDGE |
| `participant@local` | PARTICIPANT | PARTICIPANT |

(`organizer@local` also gets an ORGANIZER mapping on the fixture event
when `dogfood:toml` runs, so the checker export works.) When
`NODE_ENV != production` and `OFFLINE_MODE=true`, you can also switch
users instantly via `/api/auth/impersonate` — dev-only by design.

## Acceptance check

```bash
python3 scripts/run.py .dogfood.toml > acceptance-report.txt
```

(Works flagless because repo-root `fixtures.json` symlinks to
`src/db/fixtures.json` — see `docs/HOW-DOGFOOD-TOML.md`.)

Honest tier claims live in `.dogfood.toml` (`claimed = ["T1", "T2", "T3", "T4"]`);
the committed `acceptance-report.txt` is the checker's own output.

## Local development

```bash
cp .env.example .env   # point DATABASE_URL / S3 at local services
pnpm install           # pinned pnpm@12.3.4; approve native builds if prompted
pnpm dev               # next dev on :3000 (or :3001 via the compose `dev` service)
pnpm build && pnpm start
```

Seeding, step by step (same order the compose `seed` service uses):

```bash
pnpm db:migrate    # tsx scripts/migrate.ts — drizzle-orm's own migrator
                   # (NOT drizzle-kit migrate: version-gated, always fails here)
pnpm db:seed       # fixed demo users + dogfood-2026 event (idempotent)
pnpm db:fixtures   # src/db/fixtures.json: Sample Hack 2026, 8 tracks,
                   # 30 judges, 40 teams, 41 projects, 126 scores (idempotent)
pnpm dogfood:toml  # mints checker sessions, writes .dogfood.toml
```

## Testing

```bash
pnpm test                                          # full vitest suite
npx vitest run tests/acceptance/judging.test.ts    # one file
npx tsc --noEmit                                   # types (build ignores them)
```

Destructive live-DB tests (export/import round-trip, token ownership)
only run with `ALLOW_DESTRUCTIVE_DB_TESTS=true` plus a `DATABASE_URL`
whose database name matches `/test/i`; plain `pnpm test` never touches
Postgres for these.

## API docs

- Interactive Swagger UI: `/api/docs` (bundled `swagger-ui-react`,
  no CDN — offline-safe).
- Raw OpenAPI 3.0: `GET /api/openapi.json`; regenerate the committed
  `openapi-spec.json` with `pnpm openapi` after changing routes.
- Signed-envelope verification without a DB: `pnpm verify --`
  `--file=envelope.json --key=<public-key-pem>`.

## Docs

- `docs/ARCHITECTURE.md` — system layout, layering, request flow
- `docs/FEATURES.md` — category-wise feature list
- `docs/SCHEMA.md` — tables, relations, mermaid ERD, invariants
- `docs/JUDGING.md` — assignment, scoring, normalization
- `docs/TIER1-WALKTHROUGH.md`, `TIER2-WALKTHROUGH.md`,
  `TIER3-WALKTHROUGH.md` — tier tours with entry points
- `docs/TIER-CLAIMS.md` — honest claims and known gaps
- `docs/DESIGN-DECISIONS.md` — why the stack looks this way
- `docs/THREAT-MODEL.md` — what abuse is stopped, what is not
- `docs/NORMALIZATION-PROOF.md` — normalization on fixture data
- `docs/spec.md` — grading contract (read-only reference)

## License

OSI-approved; see [LICENSE](LICENSE).
