# Architecture

Dogfood 2026 is a Next.js 15 (App Router) + React 19 + TypeScript monolith
backed by PostgreSQL (Drizzle ORM + postgres.js) and SeaweedFS
(S3-compatible object storage). One container serves the UI and the API;
there is no separate backend process except the optional webhook worker.

## Layering (strict — do not blur)

| Layer | Location | May do |
|---|---|---|
| HTTP controllers | `app/api/**/route.ts` | Parse + Zod-validate (`parseBody`, `src/lib/api/schemas.ts`), call one service, map results with `src/server/http.ts` helpers, catch via `authErrorResponse`. **No business logic.** |
| Services | `src/server/*-service.ts` | Business logic + Drizzle queries. The **only** layer touching `src/db`, with one exception below. |
| Key custody | `src/server/crypto/keys.ts` | The **only** module touching `signing_keys` or the private-key PEM. `signing-service.ts` goes through it, never `src/db` directly. |
| Domain truth | `src/db/schema.ts` | Table defs **plus** pure invariants (`deriveEventStatus`, `canEditSubmission`, `validateTeamSize`, normalization math). |
| Shared pure code | `src/lib/**` | Isomorphic helpers (no DB): gallery filter/sort, judging math, canonical JSON, sanitization. Browser code may only call this app's API through `lib/api-client.ts`. |
| UI | `app/`, `components/` | One shared `components/` root (`ui/` = shadcn primitives). |

Request flow:

```
browser → app/api/**/route.ts → src/server/*-service.ts → drizzle → postgres
              ↕ Zod schemas            ↕ pure invariants in schema.ts / src/lib
         src/server/http.ts (requireSession, authErrorResponse, cookies)
```

## Auth & RBAC

Two-level model (`src/server/auth-service.ts`):

- `users.role` is a **global** flag — only `SUPERADMIN` is meaningful
  (bypasses all event checks).
- Everything else is **event-scoped** via `event_roles`
  (ORGANIZER/JUDGE/PARTICIPANT per `event_id`), resolved by
  `resolveEffectiveRole` / `getEffectiveRole`. A global PARTICIPANT can
  still organize one event and judge another.
- Credentials: Argon2id password hashes; opaque 256-bit session tokens,
  **SHA-256 hashed at rest** in `sessions` (7-day TTL), carried in an
  `HttpOnly`/`SameSite=Lax` `dogfood_session` cookie; `dfk_`-prefixed API
  tokens (`api_tokens`, same hash shape, optional revocation) resolve
  through the same `requireSession()`.
- `/api/auth/impersonate` is dev-only (`NODE_ENV != production` **and**
  `OFFLINE_MODE == true`).

The central rule (from `docs/spec.md`): **hiding UI is not access
control.** Every judge/event/ownership-scoped read filters in the
service/DB query (e.g. `assertEventOrganizer`, assignment-scoped score
queries, `(id AND userId)` token revocation). Console pages additionally
hard-redirect non-organizers via `hasConsoleAccess()`.

## Event lifecycle

`deriveEventStatus()` is the single source of truth for the effective
phase — `DRAFT → REGISTRATION → SUBMISSION → JUDGING → PUBLIC_VOTING →
PUBLISHED` — recomputed from timestamp columns against server clock,
never trusted from the stored (possibly stale) `events.status` column.
Deadline enforcement (`SUBMISSION_CLOSED` 403) happens at the service
boundary against the same clock.

## Signed envelopes (Ed25519)

One envelope format for everything published for offline verification:
`{format: "dogfood-signed", version, type, alg: "Ed25519", kid,
signed_at, payload, signature}`, signature over deterministic
canonical JSON (`src/lib/canonical-json.ts`). `GET /api/keys` publishes
public keys (JWKS-like); the private key never leaves
`src/server/crypto/keys.ts` or its gitignored PEM (`SIGNING_KEY_PATH`).

## Export / import invariants

- FK-safe table order, shared by export and import; explicit
  `.orderBy(id)` everywhere so repeat exports are byte-identical.
- Secrets never exported (`password_hash`, token hashes, private key);
  imported users without passwords get one shared per-import placeholder
  hash, reported back for reset.
- `audit_logs` appends (`ON CONFLICT DO NOTHING`); everything else
  upserts. Admin actions (`export.created`, `import.applied`,
  `token.created/revoked`) each write an audit row.

## Runtime topology

`docker compose up` starts: `postgres:16` (health-gated),
`seaweedfs` (S3 + filer), one-shot `seed`
(`db:migrate → db:seed → db:fixtures → dogfood:toml`, prints the
checker config to logs), then `app` (Next on :3000, migrates on boot),
`cli`, and `webhook-worker` (outbox poller, fire-and-forget). Dev
variant adds a hot-reload `dev` service on :3001. Offline-first:
no outbound network at runtime; Swagger UI is bundled, never CDN.

Styling: Tailwind v4 + shadcn (`base-nova`), black-and-white first with
green (`#16a34a`/`#22c55e`) as the only accent; `lucide-react` icons
only; every screen checked in light and dark mode.
