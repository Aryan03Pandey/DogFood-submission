# Tier 4

> **Status (as implemented): all seven parts are built.** 4.1 (signing), 4.2 (embed), 4.3
> (export/import), 4.4 (REST coverage + OpenAPI + API tokens), 4.5 (webhooks), 4.6 (signed judge
> records + results manifest), and 4.7 (certificates) — including UI where applicable: `/verify`
> (public), `/settings` (API tokens), the Gallery tab's "Embed on your site" panel, Event
> Settings' Export/Import sections, the Judging tab's Awards panel, footer/console links to
> `/api/docs`, and certificate download links on a participant's own submission page. See
> "Deviations from this spec" for where the implementation diverges from the text below. 4.5/4.6/
> 4.7 were unblocked once T2 (judge assignments/scores) and T3 (published results) merged in from
> `master` — see `CLAUDE.md`'s note on revisiting this once merged.

Tier 4 has seven parts, and all of them are meant to run fully offline inside `docker compose up`:
- Every UI action is exposed through a documented REST API, with an OpenAPI 3.0 spec served at `/api/docs`.
- Webhooks are HMAC-signed and delivered from a Postgres-backed outbox by a separate worker.
- Result manifests and judge participation records are signed with a local Ed25519 key, so anyone can verify them offline.
- Participant, winner and judge certificates are generated server-side as PDFs.
- The gallery can be embedded on other sites through an iframe.
- Events can be exported and imported atomically as JSON.

---

## 0. Read before starting

### The checker does not test T4

`run.py` has seven checks, and all of them are T1 or T2. Nothing in it exercises webhooks, signatures, embeds, certificates or import/export. This has three consequences:

- **T4 is only credited if T1 and T2 verify.** The tiers gate strictly. T4 is also judged from our own tests, the docs and the demo video, not from `run.py`.
- **Prove T4 with our own tests.** Add `tests/acceptance/t4-*.test.ts` files, run them in CI and inside Docker, and reference their output in the README.
- **Ask in Discord before claiming T3/T4.** Check how T3/T4 claims in `.dogfood.toml` are treated when `run.py` can't verify them. Claiming a tier that shows up as "claimed but not verified" is the one thing the spec says costs points.

### Dependency map

| Feature | Depends on | Status |
|---|---|---|
| 4.1 Ed25519 signing core | nothing | **Built** |
| 4.2 Embeddable gallery | T1 gallery (exists); T3 shuffle and hidden results later | **Built** (event-scoped feed only; T3 hooks left as a TODO in the embed route) |
| 4.3 Export / import | schema (exists), `load-fixtures.ts` | **Built** |
| 4.4 OpenAPI + API tokens | existing routes; grows with every feature | **Built** (extends the existing hand-rolled registry — see deviations) |
| 4.5 Webhooks | the outbox/worker has no dependencies; the events need T1 submissions and T2 judging | **Built** |
| 4.6 Signed judge records | T2 assignments and scores | **Built** |
| 4.7 Certificates | T1 teams/submissions, T2/T3 published results, prize winners | **Built** |

**Build order:** 4.1 → 4.2 → 4.3 → 4.4 → 4.5 (outbox) → 4.5 (events) → 4.6 → 4.7

### Rules that apply to everything below (from CLAUDE.md)

- **Layering.** Controllers go in `app/api/**/route.ts`. Logic and Drizzle queries go in `src/server/*-service.ts`. Zod schemas go in `src/lib/api/schemas.ts`. Pure helpers go in `src/lib/**`.
- **Check the schema first.** `src/db/schema.ts` already has tables "through T4". Before adding any table below, look for an existing one and reconcile with it rather than duplicating. The sketches here describe the *shape needed*, not new tables to create blindly.
- **Migrations.** Run `pnpm db:generate`, then `pnpm db:migrate`. Never use `drizzle-kit migrate`. In practice, migrations in this repo are hand-authored SQL matching the style of `drizzle/0000_t1_core_auth.sql` (`tests/acceptance/schema.test.ts` parses them with a regex and will fail if a Drizzle column has no matching line).
- **Phase gating.** Always use `deriveEventStatus()`, never `events.status`.
- **Access control.** It must live in the service query, never in the UI.
- **No outbound network at runtime.** No CDNs, font downloads or external APIs.
- **Audit logging.** Every admin-grade action writes to `audit_logs`: imports, exports, key generation, webhook endpoint changes and certificate issuance.
- **UI.** Follow `docs/STYLE-GUIDELINES.md`: black/white, green accent only, shadcn, and every screen checked in light and dark mode.

---

## 4.1 Ed25519 signing core

**Goal:** Anything we publish can be verified offline with only our public key.

### Library

Node's built-in `crypto` with `generateKeyPairSync('ed25519')` and `crypto.sign(null, bytes, key)`. No dependency needed.

### Files (as built)

- `src/lib/canonical-json.ts`: deterministic serialization (pure and isomorphic).
  - Keys are sorted recursively, with no whitespace.
  - Throws on `undefined`, `NaN`, `Infinity`, functions and `BigInt`.
  - Dates must already be ISO-8601 UTC strings; the caller converts them.
  - Follows the spirit of RFC 8785 (JCS).
- `src/server/crypto/keys.ts`: loads or creates the keypair.
  - The private key is a PEM file at `SIGNING_KEY_PATH`, default `./data/keys/ed25519.pem` (`/data/keys/ed25519.pem` in Docker, on the named `keys` volume).
  - Written with the `wx` (exclusive-create) flag so two concurrent first requests can't generate two different keys; on `EEXIST` the writer discards its own freshly-generated key and re-reads the file that won the race.
  - `0600` permissions. Key generation (not every load) is audit-logged.
  - **The private key never goes in the DB or in an export.**
  - `kid` = base64url(SHA-256(raw 32-byte public key)), first 16 characters.
  - The public key + `kid` is upserted into `signing_keys` on **every** load, not only on first generation — the Postgres volume can be reset independently of the `keys` volume, and the row must be re-created either way.
- `src/server/signing-service.ts`: `signEnvelope(type, payload)` and `verifyEnvelope(envelope)`.
- `scripts/verify.ts`: a standalone verifier that needs only the envelope file and a public key file. No DB access, no network (`pnpm verify -- --file=x.json --key=pub.pem`).

### Envelope format

```json
{
  "format": "dogfood-signed",
  "version": 1,
  "type": "results-manifest | judge-record | certificate | export",
  "alg": "Ed25519",
  "kid": "Xk3…",
  "signed_at": "2026-09-27T10:00:00Z",
  "payload": { },
  "signature": "base64url(sign(canonical({format,version,type,alg,kid,signed_at,payload})))"
}
```

The signature covers every field except `signature` itself.

### Keys table (public keys only)

```
signing_keys(kid PK, public_key_pem, created_at, retired_at NULL)
```

### Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/keys` | public | All public keys with their `kid` and status (JWKS-like) |
| POST | `/api/verify` | public | Body: an envelope. Returns `{ valid, kid, type, reason? }` |

Independent verification with no Dogfood code, using `openssl pkeyutl -verify -rawin`, is documented in `scripts/verify.ts`'s header comment.

### Tests

`tests/acceptance/t4-signing.test.ts` — sign→verify round-trips, a tampered payload fails, a swapped `type` fails, an unknown `kid` fails, a retired key still verifies older envelopes, canonicalization is stable regardless of key insertion order.

---

## 4.2 Embeddable gallery widget

**Goal:** Organizers paste one snippet into an external site and get a live gallery.

### Snippet

```html
<script src="http://HOST/embed.js" data-event="evt_01" data-theme="light" data-track="trk_01" async></script>
```

### Files (as built)

- `app/embed/[eventId]/page.tsx`: a chrome-less gallery (no site header).
  - Reuses `getEventGalleryProjects()` in `gallery-service.ts`, itself built on the same `isGalleryVisible`/`sortGalleryProjects` helpers the main gallery uses. There is no second visibility query. It 404s only when the event id doesn't exist at all; an event that exists but hasn't reached `ARCHIVED` (the same phase gate the main gallery uses) renders a valid, empty feed rather than a 404 — visually a "no projects yet" widget instead of a broken iframe.
  - Query params: `theme=light|dark`, `track`, `limit`.
  - A small client component runs a `ResizeObserver` on `document.body` and posts `{type:'dogfood:resize', height}` to `window.parent` on every size change.
- `public/embed.js`: a small plain-JS loader (no framework).
  - Finds its own `<script>` tag, computes the portal's origin from its own `src`, and injects an `<iframe>` pointing at `/embed/:eventId`.
  - Listens for `message` and resizes the iframe only when `event.origin` equals the portal origin **and** `event.source === iframe.contentWindow` — the iframe (embed page) is the sender of the resize message, `embed.js` on the host page is the receiver; these are cross-origin by design, so origin/source checks matter more than same-origin.
- `next.config.mjs` `headers()`:
  - The global rule (`/:path*` → `frame-ancestors 'self'`) is listed **first**.
  - The `/embed/:path*` override (`frame-ancestors *`) is listed **second** — Next.js applies header rules in array order and the last matching entry wins for a given key, so ordering here is load-bearing, not cosmetic.

### Rules

- **Public data only.** Session cookies (`SameSite=Lax`) aren't sent in cross-site iframes anyway. The embed must never depend on auth.
- **T3 hooks (TODO once T3 lands).**
  - Use the same seeded shuffle as the gallery.
  - Must **not** show vote counts or results while the phase is `PUBLIC_VOTING`.
- **Styling.** Theme tokens only, so `theme=dark` is just the `.dark` class. Each project links back to its full project page with `target="_blank"`.

### Tests

`tests/acceptance/t4-embed.test.ts` — the embed route returns 200 with no auth, drafts/hidden never appear, a non-public event 404s, and `next.config.mjs`'s `headers()` array is asserted directly (not against a live server) to have the global rule before the embed override.

---

## 4.3 Bulk export / import (atomic JSON backup and restore)

**Goal:** Move an event, or the whole instance, between installs with one file. This also doubles as our backup story.

### Format

Every export is **always signed** (Ed25519, `type: "export"` — see 4.1) before it leaves `export-service.ts`. What a caller actually receives/uploads is the signed wrapper, whose `payload` is the export envelope shown below:

```json
{
  "format": "dogfood-signed",
  "version": 1,
  "type": "export",
  "alg": "Ed25519",
  "kid": "…",
  "signed_at": "…",
  "signature": "…",
  "payload": {
    "format": "dogfood-export",
    "version": 1,
    "exported_at": "…",
    "scope": "event | instance",
    "data": {
      "users": [], "user_projects": [], "event_roles": [], "events": [], "tracks": [], "prizes": [],
      "teams": [], "team_members": [], "submissions": [], "rubrics": [],
      "judge_tracks": [], "conflicts_of_interest": [], "judge_assignments": [], "scores": [],
      "pairwise_comparisons": [], "votes": [], "audit_logs": [], "signing_keys": []
    }
  }
}
```

`import-service.ts` unwraps and verifies this automatically (`ImportError` code `INVALID_SIGNATURE` if the signature doesn't match), but also still accepts a bare, unsigned `payload`-shaped object directly, for backward compatibility with anything exported before signing was added and with hand-built fixtures in tests. This is what makes `/verify` meaningful for a real file in this app, and what gives the intended demo sequence: export → tamper the file → `/verify` fails → import refuses.

Query/import order is FK-safe top to bottom as listed above — `users` and `event_roles` first, since almost everything else references a user. (`user_projects` and `conflicts_of_interest` were added when this repo merged in the team/event-creation/judging features built alongside Tier 4 — see the "Deviations" section.)

- **Never exported:**
  - `sessions`
  - `api_tokens` (hash + metadata)
  - webhook secrets (n/a — 4.5 deferred)
  - the signing private key/PEM file
- **Password hashes** are excluded by default. Included only with the CLI flag `--include-credentials`, never via the HTTP API. When a `users` row in the import payload has no `password_hash`, the importer assigns one shared per-import throwaway Argon2 hash (same pattern as `scripts/load-fixtures.ts`'s `throwawayPasswordHash()`) and reports which user IDs got one — those accounts need a real password set via the API or `dogfood-cli` before they can log in.
- **`signing_keys`** is included (public key + `kid` only) so a restore on another instance can still verify previously-signed artifacts.
- Every export query orders by `id` explicitly, so two exports of the same data are byte-identical (aside from `exported_at`) — this is what makes the round-trip test meaningful.
- `audit_logs` is append-only: import upserts everywhere use `ON CONFLICT (id) DO UPDATE`, except `audit_logs`, which uses `ON CONFLICT (id) DO NOTHING`.

### Files (as built)

- `src/lib/api/export-schema.ts`: the Zod schema for the envelope above.
- `src/server/export-service.ts`: streams rows table by table in the FK order above.
- `src/server/import-service.ts`:
  1. Parses and validates the whole file against the Zod schema **before** touching the DB.
  2. Opens **one transaction** and upserts in FK order, keyed on stable IDs.
  3. Any error rolls back everything — this rollback is what makes the import atomic.
  4. `--dry-run` runs the full transaction and rolls it back regardless, returning row counts.
  5. `scope=instance` restore is refused into a non-empty instance unless `--force`. "Non-empty" is defined precisely as: any rows exist in `teams`/`submissions`/`scores`/`votes`/`pairwise_comparisons`, **or** any `events` row's slug differs from the known seed/fixture slug (`slugify('Sample Hack 2026')`). Without this precise definition, "non-empty" would always be true after a normal `docker compose up` boot (which always seeds baseline users + the fixture event), making `--force` mandatory even for a brand-new install.
- CLI (`scripts/cli.ts`):
  - `export --event=evt_01 --out=file.json [--include-credentials]`
  - `backup --out=file.json [--include-credentials]`
  - `import --file=… [--dry-run] [--force]`

### Routes

| Method | Path | Auth |
|---|---|---|
| GET | `/api/events/:id/export.json` | ORGANIZER of that event, or SUPERADMIN |
| POST | `/api/admin/import` | SUPERADMIN only; rejects bodies over 25 MB via `Content-Length` before parsing |

### Testing note: some tests need a real, disposable database

Load the fixtures, export, wipe the relevant tables, import, then export again — the two exports must be deep-equal, ignoring `exported_at`. This is genuinely the strongest proof of 4.3, but it wipes tables, so it must never run against a real database by accident. The same reasoning applies to a few other guarantees that are fundamentally Postgres-level (event-scoped export isolation, FK-violation rollback, idempotent re-import, a token's ownership actually being enforced by SQL rather than just by the route) — these all live in `describe.skipIf(...)` blocks gated behind **both** `ALLOW_DESTRUCTIVE_DB_TESTS=true` **and** a `DATABASE_URL` whose database name matches `/test/i`; without both, every such block is skipped and a plain `pnpm test` never touches Postgres. To actually run them (against a real, disposable test database — never your dev DB):

```bash
ALLOW_DESTRUCTIVE_DB_TESTS=true \
DATABASE_URL=postgres://dogfood:dogfood@localhost:5432/dogfood_test \
npx vitest run tests/acceptance/t4-export-import.test.ts tests/acceptance/t4-tokens.test.ts
```

Everything else in `tests/acceptance/t4-*.test.ts` is DB-free (mocking `../db` or the one module that touches it) and runs on every `pnpm test`, including a `jsdom`-environment file (`t4-embed-js.test.ts`, hence the `jsdom` devDependency) that executes `public/embed.js` as a real script against a simulated host page, and a subprocess test (`t4-verify-cli.test.ts`) that runs `scripts/verify.ts` with `DATABASE_URL` unset to prove it needs no database at all.

### Later (needs T2)

Bulk CSV import of judges (`email,name,tracks`) into judge invitations. Coordinate with whoever builds T2's CSV export, so both use one CSV module in `src/lib/csv.ts`.

---

## 4.4 REST API coverage + OpenAPI

**Goal:** Every UI action has a documented endpoint (the "API First" +3 bonus).

### Spec generation (as built — see deviations)

The repo already had a hand-rolled Zod→JSON-Schema converter and a single route registry (`apiRoutes` in `src/server/openapi.ts`), predating this doc. Rather than introduce `@asteasolutions/zod-to-openapi` and a second, parallel registry, every T4 route is registered in that same `apiRoutes` array. `tests/acceptance/auth.test.ts` already asserts the registry's path list and keeps `openapi-spec.json` in sync with it — new routes must be added there too, then `pnpm openapi` re-run to regenerate the committed spec.

### Serving

- `GET /api/openapi.json` returns the spec.
- `GET /api/docs` renders it with `swagger-ui-react`, loaded via `next/dynamic(..., { ssr: false })` and bundled by Next (not a CDN), so it renders with the network off. Added to **both** `pnpm-lock.yaml` and `package-lock.json` (the Dockerfile's `npm ci` reads the latter).

### Coverage enforcement

`tests/acceptance/t4-openapi-coverage.test.ts` globs `app/api/**/route.ts`, reads each file's exported HTTP methods, and fails if any method/path pair is missing from `apiRoutes`.

### API tokens (for scripts and integrations)

- **Storage:** `api_tokens(id, user_id, name, token_hash, created_at, last_used_at, revoked_at)`. Tokens are hashed with SHA-256 exactly like sessions (`hashSessionToken` in `src/lib/auth/index.ts`); the raw token is shown only once.
- **Format:** `Authorization: Bearer dfk_<random>`.
- **Session resolution:** `src/server/http.ts` checks the cookie first, then the bearer token. Both resolve to the same `SessionUser` shape, so the same event-scoped RBAC (`getEffectiveRole`) applies with no second permission system.
- **Routes:** `POST /api/tokens` (create), `GET /api/tokens` (list — name, prefix, dates only, never the hash), `DELETE /api/tokens/:id` (revoke).

### Conventions (deviation from this spec's draft — see below)

The error shape used by every T4 route is the **existing** flat `{ "error": "CODE" }` (via `jsonError`/`authErrorResponse` in `src/server/http.ts`), not the nested `{ error: { code, message } }` this doc originally sketched — the flat shape is what every T1 route and `lib/api-client.ts` already expect, and changing it globally was out of scope for this pass.

- **401 vs 403:** 401 means not authenticated, 403 means authenticated but not allowed.
- **Validation errors:** 400 with Zod issues (existing `authErrorResponse` behavior), not 422 — kept consistent with T1 routes.

---

## 4.6 Signed judge records + results manifest

**Goal:** Two more envelope types on top of the 4.1 signing core, now that T2 judging and T3
published results actually exist to sign.

### Judge records are aggregate-only, on purpose

A judge-record is a *participation attestation*, not a data export: it proves "this judge scored
N of M assigned submissions for this event between these dates," and deliberately carries **no**
rubric scores, comments, or submission IDs. Putting per-assignment scores into a document a judge
can hold and show around would undermine the double-blind/peer-score-isolation guarantee the spec
weights most heavily (a judge must never be able to reconstruct another judge's scores — see
`CLAUDE.md`'s note on the `peer_scores` route). `src/server/records-service.ts#getJudgeRecord`
returns `{eventId, judgeId, judgeName, assignedCount, completedCount, firstScoredAt,
lastScoredAt}`, signed as `type: 'judge-record'`.

### Results manifest is public once PUBLISHED

`getResultsManifest(eventId)` takes no actor at all — it's public and unauthenticated, same spirit
as the public gallery: once an event's derived status (`deriveEventStatus()`, never the stored
`status` column) is `PUBLISHED`, the results are meant to be independently verifiable by anyone,
not gated behind a role. Before `PUBLISHED` it refuses uniformly with `RESULTS_NOT_PUBLISHED`
(409) regardless of who's asking — that's the one access check that matters here, and it lives in
the service, not behind `requireSession()`. The payload combines `judging-service.ts`'s ranking
math (raw/zScore/minMax/trimmedMean — refactored into a shared `computeRankings` so
`getPublishedRankings(eventId)` and the organizer-only `getRankings(actor, eventId)` can't drift
apart) with public vote totals, signed as `type: 'results-manifest'`.

### Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/judge/records` (`?eventId=&judge=`) | session; judge defaults to caller, or organizer/superadmin of that event | Signed judge-record envelope |
| GET | `/api/events/:id/results-manifest.json` | public | Signed results-manifest envelope; 409 before `PUBLISHED` |

### Tests

`tests/acceptance/t4-records.test.ts` — DB-free (same mocking convention as `t4-signing.test.ts` /
`t4-export-signing.test.ts`): a judge-record round-trips through real `signEnvelope`/
`verifyEnvelope` and is asserted to contain **no** score/comment/submission fields; a different
judge (non-organizer) is refused; the manifest 409s pre-`PUBLISHED` and succeeds with **no auth
header at all** post-`PUBLISHED`, including vote totals.

---

## 4.7 Certificates

**Goal:** Server-side PDF certificates (participant and winner), signed the same way as every
other Tier 4 artifact.

### New table: `prize_awards`

Nothing in the schema previously recorded *who won a prize* — `prizes` only stores the prize
definition (title, cash value, kind). `src/db/schema.ts`'s `prizeAwards` table
(`drizzle/0017_prize_awards.sql`) closes that gap: `(id, prizeId UNIQUE, submissionId, awardedAt,
awardedBy)`. One winner per prize, enforced at the DB layer via the unique constraint on
`prizeId`, not just a service-layer check — `awardPrize` surfaces a conflict as
`PRIZE_ALREADY_AWARDED` (409).

### Content is deliberately minimal

A certificate's payload and PDF both carry **only** name, event, role (Participant/Winner), prize
title if a winner, and the issue date — no email or other contact PII — since the PDF and its
signed envelope are designed to be shared/verified by anyone via `/verify`, not just kept private
by the recipient.

### Files

- `src/server/certificate-service.ts` — `generateParticipantCertificate`/`generateWinnerCertificate`
  (`pdfkit`-rendered PDF + a `type: 'certificate'` signed envelope), `awardPrize`/`listPrizeAwards`/
  `revokePrizeAward` (organizer/superadmin CRUD on `prize_awards`), `getPrizeAwardForSubmission`
  (unscoped by design — the caller already knows the submission ID from their own
  `getMySubmission()` result; this only answers "did that submission win anything").
- `components/console/judging/awards-panel.tsx` — organizer picks a prize + a finalized
  submission to record a winner; only submissions with `status === 'final'` are offered.

### Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/events/:id/certificates/participant/:submissionId` (`?format=json`, `?user=`) | team member of that submission, or organizer/superadmin | PDF or signed envelope |
| GET | `/api/events/:id/certificates/winner/:prizeAwardId` (same query params) | same | PDF or signed envelope |
| GET/POST | `/api/events/:id/prize-awards` | organizer/superadmin | List / record a winner |
| DELETE | `/api/events/:id/prize-awards/:awardId` | organizer/superadmin | Revoke a recorded winner |

Certificate downloads on a participant's own submission page (`/hackathons/:slug/submit`) are
plain `<a href download>` links, same pattern as the Export button in `settings-panel.tsx` — no
`lib/api-client.ts` fetch wrapper needed, the browser's session cookie carries auth on a same-
origin navigation.

### Tests

`tests/acceptance/t4-certificates.test.ts` — DB-free (same mocking convention as the other T4
suites): a real `pdfkit`-rendered PDF buffer is asserted to start `%PDF-1.` and end `%%EOF`; the
signed envelope is asserted to contain no email field; a draft (unfinalized) submission is
refused; a non-member/non-organizer requesting someone else's certificate 403s.

---

## 4.5 Local webhooks

**Goal:** Event-driven HTTP POST notifications, delivered reliably (with retries and backoff)
from a Postgres-backed outbox by a separate worker process, HMAC-signed so a receiver can verify
they actually came from this instance.

### New tables

- `webhook_endpoints` (`drizzle/0016_webhooks.sql`): `(id, eventId, url, secret, isActive,
  createdAt, createdBy)`. `secret` is the HMAC key, shown once at creation and never returned
  again — same treatment as an API token's raw value.
- `webhook_deliveries` (the outbox): `(id, endpointId, eventId, eventType, payloadJson, status,
  attempts, nextAttemptAt, leaseUntil, lastError, createdAt, deliveredAt)`. A **partial unique
  index** on `(endpointId, eventId, eventType)` exists only where `eventType IN
  ('judging.completed', 'results.published')` — those two are per-event singletons; enqueueing
  them uses `INSERT ... ON CONFLICT DO NOTHING` and the index itself is the dedupe mechanism, not
  an app-level existence check. `submission.created` has no matching constraint (it legitimately
  fires many times per event) and always inserts.

### SSRF hardening on organizer-supplied URLs

Webhooks are the first feature in this app that calls a URL an organizer supplies, not an
operator-provisioned compose service. `src/server/webhook-url-guard.ts#assertSafeWebhookUrl`
rejects non-`http(s)` schemes, a literal blocklist of compose service hostnames (`postgres`,
`seaweedfs`, `app`, `dev`, `localhost` — these resolve fine from inside the compose network, so
DNS alone can't catch them), and any resolved IP in a loopback/private/link-local range (IPv4 and
IPv6). It runs **twice**: once at registration (`registerWebhook`), once again immediately before
each delivery attempt (`webhook-delivery-service.ts#attemptDelivery`) — the second check defends
against DNS rebinding, where a hostname resolves safely at registration but is repointed at an
internal address by delivery time.

Two env-var escape hatches, deliberately different in scope, both empty/off by default:

- **`WEBHOOK_ALLOWED_HOSTS`** — a comma-separated per-hostname allowlist (e.g.
  `WEBHOOK_ALLOWED_HOSTS=hooks.example.com,ci.internal.example.org`). Only the listed hostnames
  skip the blocklist/IP checks; every other host is still fully checked. This is the one to reach
  for normally — e.g. an operator whose webhook receiver happens to resolve to an address this
  guard would otherwise flag, without opening up every private address. **Must be set identically
  on both the `app` service (registration) and the `webhook-worker` service (delivery)** —
  `assertSafeWebhookUrl` runs independently in each process, so a host allowed at registration
  but not on the worker will still fail every delivery attempt's send-time re-check.
- **`WEBHOOK_ALLOW_PRIVATE_HOSTS=true`** — a blanket bypass for every host, only for local testing
  against a listener on the compose network (same "explicit opt-in" shape as
  `ALLOW_DESTRUCTIVE_DB_TESTS`).

See `docs/THREAT-MODEL.md` for the full reasoning and `.env.example` for both vars.

### Signing

`X-Dogfood-Timestamp` (unix seconds) + `X-Dogfood-Signature: sha256=<hex>`, where the HMAC covers
`` `${timestamp}.${canonical body}` `` (via `src/lib/canonical-json.ts`), not the body alone —
same shape as Stripe/GitHub webhook signing, so a receiver can reject a stale/replayed delivery by
checking the timestamp is recent. `X-Dogfood-Event` and `X-Dogfood-Delivery` carry the event type
and delivery id. This app doesn't ship a receiver, so timestamp-freshness enforcement is guidance
for an integrator, not something verified here.

### Worker: atomic claim-with-lease

`scripts/webhook-worker.ts` is a thin entry point (poll loop, `SIGTERM`/`SIGINT` graceful
shutdown) around `src/server/webhook-delivery-service.ts#processBatch`, kept in `src/server/` —
not `scripts/` — specifically so it's importable by tests without the script's poll loop or a
real DB connection running. Each poll claims a batch **atomically**, one statement:

```sql
UPDATE webhook_deliveries
SET status = 'IN_PROGRESS', lease_until = now() + interval '30 seconds'
WHERE id IN (
  SELECT id FROM webhook_deliveries
  WHERE (status = 'PENDING' AND next_attempt_at <= now())
     OR (status = 'IN_PROGRESS' AND lease_until < now())
  ORDER BY next_attempt_at
  LIMIT 20
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

Not select-then-update, which would race two worker replicas. The `status = 'IN_PROGRESS' AND
lease_until < now()` branch reclaims rows a crashed/killed worker never finished — no separate
cleanup job needed. Delivery happens outside the claiming transaction; on failure, `attempts`
increments and `nextAttemptAt` backs off exponentially (30s × 2^attempts, capped ~1h) until
`attempts` reaches 8, at which point the row becomes terminally `FAILED`.

### Emission points

Each a one-line call after an existing write, using `enqueueWebhookEvent` (no-op — zero rows,
zero outbound calls — when the event has no registered endpoints, which is the default state and
what keeps this `OFFLINE_MODE`-compatible without special-casing):

- **`submission.created`** — `submission-service.ts#createDraft`, right after the insert.
- **`judging.completed`** — `judging-service.ts#saveJudgeScore`, after marking the assignment
  `DONE`: recomputes the event's assigned/completed counts and enqueues once they're equal and
  nonzero. No stored "judging complete" flag exists anywhere in this codebase (`getAssignmentProgress`
  computes it live too) — this is a live recomputation on every save, made safe to repeat by the
  partial unique index above.
- **`results.published`** — has no write path to hook at all: `PUBLISHED` is purely time-derived
  from `publicVotingEndTime` via `deriveEventStatus()`, never an explicit organizer action.
  Detected **lazily** inside `dashboard-service.ts#getDashboardOverview`, hit on every organizer
  console load: if the derived status is `PUBLISHED`, it attempts the enqueue (deduped the same
  way). This trades a small amount of latency (first organizer dashboard load after the deadline
  passes) for zero new infrastructure — no cron/scheduler exists anywhere in this repo, and adding
  one solely for this one event type would be disproportionate. This is the one genuinely
  debatable design call in this feature.

### Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/events/:id/webhooks` | organizer/superadmin | List endpoints (never the secret) |
| POST | `/api/events/:id/webhooks` | organizer/superadmin | Register an endpoint; secret shown once |
| DELETE | `/api/events/:id/webhooks/:webhookId` | organizer/superadmin | Revoke an endpoint |

### Running the worker

`docker-compose.yml`'s `webhook-worker` service (`npm run worker:webhooks`) reuses the `app`
image — no second build — with `restart: unless-stopped`, depends only on `postgres`/`seed`, and
nothing else `depends_on` it (fire-and-forget; `app`'s own startup never waits on it). Locally:
`pnpm worker:webhooks` (needs `DATABASE_URL` reachable, same as any other script here).

### Tests

`tests/acceptance/t4-webhooks.test.ts` — DB-free, `node:dns` mocked for determinism: every SSRF
check (scheme, compose hostname blocklist, private/loopback/link-local IPv4 and IPv6, the
`WEBHOOK_ALLOW_PRIVATE_HOSTS` blanket bypass, and `WEBHOOK_ALLOWED_HOSTS`'s per-hostname allowlist
— including that unlisted hosts stay fully checked), the HMAC signature against a known test
vector, the backoff calculation, and the worker's per-delivery-attempt function (mocked `fetch`) on success/failure/
network-error, plus proving an unsafe URL never reaches `fetch` at all.

---

## Deviations from this spec

This doc originally assumed a green-field implementation. Once written against the actual repo, several things changed:

1. **OpenAPI registry.** Reuses the existing hand-rolled `src/server/openapi.ts` (`apiRoutes` + `zodToJsonSchema`) instead of adding `@asteasolutions/zod-to-openapi` and a new `src/lib/api/openapi-registry.ts` — the existing one is already tested and load-bearing (`tests/acceptance/auth.test.ts`).
2. **Error shape.** Kept the existing flat `{ error: "CODE" }` convention instead of introducing `{ error: { code, message } }` — the nested shape would have required touching every existing T1 route and `lib/api-client.ts` to stay consistent.
3. **`/data/keys` permissions.** The Dockerfile has no `USER` directive, so the container runs as root and `/data/keys` is writable without extra `chown` steps. If a non-root `USER` is ever added to the Dockerfile, the `keys` named volume will need matching ownership — re-check `src/server/crypto/keys.ts` at that point.
4. **`@types/pdfkit`.** `pdfkit` itself was already a pinned dependency (added ahead of 4.7 actually landing), but had never been imported anywhere and ships no bundled type declarations. Added `@types/pdfkit` as a devDependency (both `pnpm-lock.yaml` and `package-lock.json` updated per this repo's dual-lockfile rule) so `npx tsc --noEmit` type-checks `certificate-service.ts` — it's dev-only, no `pnpm-workspace.yaml` `allowBuilds` entry needed (pure type declarations, no postinstall).
5. **4.5's worker code lives in `src/server/`, not `scripts/`.** `scripts/webhook-worker.ts` is a thin entry point; the claim/send/backoff logic is `src/server/webhook-delivery-service.ts` so it's importable by `tests/acceptance/t4-webhooks.test.ts` without the script's poll loop or a live DB connection running — the same reasoning that keeps every other T4 service DB-free-testable.
