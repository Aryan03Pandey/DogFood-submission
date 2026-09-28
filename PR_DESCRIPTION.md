## Summary

Implements the buildable slice of Tier 4 — **4.1 Ed25519 signing**, **4.2 embeddable gallery widget**, **4.3 atomic export/import**, and **4.4 REST/OpenAPI coverage + API tokens** — plus a full test pass covering authz, secret handling, and atomicity. 4.5 (webhooks), 4.6 (signed judge records), and 4.7 (certificates) are deliberately **deferred**: they depend on the team/submission engine (T1) and judging engine (T2), neither of which exist in this repo yet. See [`docs/TIER4.md`](docs/TIER4.md) for the full spec, the dependency reasoning, and documented deviations from the original draft.

## What changed

### 4.1 — Ed25519 signing core
- `src/lib/canonical-json.ts` — deterministic JSON serialization (RFC 8785-style), rejects `undefined`/`NaN`/`Infinity`/functions/`BigInt`.
- `src/server/crypto/keys.ts` — loads or generates the signing keypair (PEM at `SIGNING_KEY_PATH`), exclusive-create (`wx`) to avoid a two-request race, `0600` permissions, and always re-registers the public key in `signing_keys` on every load (survives a DB reset that outlives the key file).
- `src/server/signing-service.ts` — `signEnvelope`/`verifyEnvelope` for the `dogfood-signed` envelope format.
- New table `signing_keys` (`drizzle/0004_signing_keys.sql`).
- `GET /api/keys` (public key listing), `POST /api/verify` (always 200 + `{valid, reason}`, deliberately never 422 — see docs).
- `scripts/verify.ts` — standalone CLI verifier, no DB/network dependency.

### 4.2 — Embeddable gallery widget
- `src/server/gallery-service.ts#getEventGalleryProjects` — event-scoped feed reusing the existing gallery visibility/sort rules.
- `app/embed/[eventId]/page.tsx` + `resize-reporter.tsx` — chrome-less iframe content with `ResizeObserver`-driven auto-sizing.
- `public/embed.js` — plain-JS loader; validates `event.origin` **and** `event.source` before trusting a resize message (cross-origin, not same-origin).
- `next.config.mjs` — ordered CSP `headers()` (global `frame-ancestors 'self'` first, `/embed/*` override second — order is load-bearing, not cosmetic).

### 4.3 — Atomic export / import
- `src/lib/api/export-schema.ts`, `src/server/export-service.ts`, `src/server/import-service.ts` — FK-ordered export/import, deterministic (`ORDER BY id`), credentials excluded by default, placeholder password hashes assigned on import when missing, `audit_logs` treated as append-only (`ON CONFLICT DO NOTHING`).
- Precise **non-empty-instance** guard (`isEmptyGiven`) — a plain "any rows exist" check would make `--force` mandatory even for a fresh `docker compose up`, since seed + fixtures always create data.
- `scripts/cli.ts` — `export`, `backup`, `import [--dry-run] [--force]`.
- `GET /api/events/:id/export.json` (organizer-of-event or superadmin), `POST /api/admin/import` (superadmin only, 413 on oversized bodies via `Content-Length`).

### 4.4 — OpenAPI coverage + API tokens
- Extended the **existing** hand-rolled `src/server/openapi.ts` registry rather than adding a new dependency/registry.
- `GET /api/openapi.json`, `GET /api/docs` (`swagger-ui-react`, dynamically imported with `ssr:false`, bundled — not a CDN).
- `api_tokens` table, `src/server/token-service.ts` (SHA-256 hashed, `dfk_` prefix, shown once), `src/server/http.ts#requireSession` now resolves a cookie session **or** a `Bearer` token through the same code path.
- `POST/GET /api/tokens`, `DELETE /api/tokens/:id`.

### Audit logging (fixed, not just tested)
`export.created`, `import.applied`, `token.created`, and `token.revoked` now all write to `audit_logs` — this was a real gap (only key generation was audited before), not just missing test coverage.

### Bug fix
The embed page's `limit` query param accepted negative numbers (e.g. `limit=-5`), which fed straight into `Array.prototype.slice(0, -5)` and silently dropped the last 5 items instead of meaning "no limit." Now only a positive integer is accepted.

## Tests

19 new/updated test files, **158 passing + 9 gated/skipped**, `tsc --noEmit` clean, `next build` compiles every new route.

- **Authz matrix** (`t4-authz.test.ts`) for export/import: anon → 401, wrong-event organizer → 403, correct organizer/superadmin → 200, oversized import body → 413.
- **Tokens** (`t4-tokens.test.ts`): raw token shown once, hash never leaves the server, malformed/unknown bearer never touches the DB, route always scopes to the caller's own id.
- **Atomicity** (`t4-import-atomicity.test.ts`): a structurally invalid row anywhere in the payload rejects the whole import *before* a transaction ever opens.
- **Secret exclusion**: structural proof the export schema has no field for sessions/token hashes/private keys, plus a gated raw-JSON scan.
- **Signing**: canonical-JSON edge cases (unicode, nested arrays, `-0`, large numbers), key-file lifecycle (permissions, reuse across a simulated restart, DB row re-registration), `scripts/verify.ts` run as a subprocess with `DATABASE_URL` unset.
- **Embed**: `public/embed.js` executed as a real script (new `jsdom` devDependency) — iframe injection, wrong-origin/wrong-source/wrong-type message rejection, valid resize; track/limit/theme edge cases; confirms no `dangerouslySetInnerHTML` anywhere.
- **Gated, live-DB-only** (opt-in via `ALLOW_DESTRUCTIVE_DB_TESTS=true` + a `DATABASE_URL` matching `/test/i` — never runs against a real dev DB): full export→wipe→import→export round trip, idempotent re-import, event-scoped export isolation, FK-violation rollback, audit-log rows actually present.

## Deviations from the original Tier-4 draft

Documented in full in `docs/TIER4.md`, summarized here:
1. Reused the existing OpenAPI registry instead of adding `@asteasolutions/zod-to-openapi`.
2. Kept the existing flat `{ error: "CODE" }` response shape instead of introducing a nested one.
3. `/api/verify` always answers 200 (`valid:false` on anything malformed) rather than 422, so callers get one consistent shape.
4. `/data/keys` write access assumes the Dockerfile's current root user (no `USER` directive) — flagged for re-check if that ever changes.

## Not covered by this PR

- 4.5 (webhooks), 4.6 (signed judge records), 4.7 (certificates) — blocked on T1/T2 features that don't exist yet.
- A real `docker compose up` smoke test — no Docker daemon in the environment this was built in; should be run by hand before any release/freeze.
