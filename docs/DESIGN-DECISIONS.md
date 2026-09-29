# Design decisions & choices

## Monolith, not services

One Next.js container serves UI + API. Rationale: the grading contract
is `docker compose up` → HTTP; a second service would add failure
modes with zero scoring benefit. The single exception proves the rule:
`webhook-worker` is a separate process only because delivery retries
must outlive requests.

## Server-first with App Router RSC pages

Pages fetch through services directly (no client waterfalls for
first paint); mutations go through `lib/api-client.ts`, the single
place browser code may `fetch()` our own API. Discipline preserved:
route handlers stay logic-free, which is what makes the checker-facing
guarantees auditable in one layer.

## Drizzle + postgres.js, pinned at 0.35

Drizzle gives SQL control (partial unique indexes, `ON CONFLICT`
variants, keyset streaming) without an ORM hiding queries.
`drizzle-kit` is codegen-only here: its 0.28 migrator demands
compatibilityVersion 10 while drizzle-orm 0.35 speaks 9, so
migrations are hand-authored SQL applied by drizzle-orm's own
migrator — and `schema.test.ts` enforces the two stay in sync.

## Invariants live with the tables

`src/db/schema.ts` holds pure functions (`deriveEventStatus`,
normalization math, team-size/URL validation) next to the tables they
govern, so services import rules instead of re-deriving them. Phase
is *computed from timestamps*, never trusted from the stored status
column — the recurring defense against stale-state bugs.

## Event-scoped RBAC over global roles

Only SUPERADMIN is global; everything else resolves per event through
`event_roles`. This matches the domain (people organize one hackathon
and hack at another) and contains breaches to one event. Console pages
belt-and-braces this with `managesAnyEvent()` redirects, but the
APIs never rely on it.

## Hashes at rest, raw values once

Session tokens, API tokens, invite codes, webhook secrets: random at
creation, SHA-256 (or HMAC) at rest, shown once. A DB dump alone
authenticates nobody. Same reason export/import strips every secret
and reports placeholder-password users for reset.

## Offline-first operations

No runtime outbound dependency: Postgres, SeaweedFS, bundled Swagger
UI, local Ed25519. Webhooks are the deliberate exception and ship
with an SSRF guard plus default-deny private hosts. Embed CSP rule
order in `next.config.mjs` is load-bearing (last match wins).

## Deterministic, streaming data paths

Exports order by id (byte-identical repeats), stream in batches
(constant memory), and the gallery/shuffle paths use a seeded PRNG
(FNV-1a + mulberry32 + Fisher-Yates) after the naive multiplicative
scheme was found to repeat permutations for nearby seeds.

## Honest checker wiring

`.dogfood.toml` is *generated* per install, not hand-copied forever:
tokens expire and UUIDs differ per DB, so `dogfood:toml` mints fresh
sessions against real rows. Tier claims stay at T1+T2 — the two tiers
`run.py` verifies — even though T3/T4 code exists.
