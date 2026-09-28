# Feature list (by category)

## Accounts & access

- Email + Argon2id password signup/login; opaque hashed sessions,
  7-day TTL, `HttpOnly`/`SameSite=Lax` cookies.
- `dfk_`-prefixed API tokens (create/revoke/list, last-used tracking).
- Profiles: name, contact, profession, skills, links, showcase
  projects, password rotation on proof of current password.
- Avatar menu and navbar hide privileged entries (Organizer Dashboard,
  Host-an-Event) unless the viewer qualifies.
- Dev-only impersonation for offline testing.

## Events & console

- 7-step creation wizard (basics with auto-slug, description,
  media, timeline with past-date blocking, tracks, rules, prizes —
  zero prizes allowed) with per-step save; edit page reuses the wizard;
  live events freeze title/rules/tracks/prizes in UI **and** API.
- Console dashboard tabs: overview (real metrics, Review-&-publish →
  password-confirmed go-live), participants, submissions, judging,
  voting, gallery, settings (members, webhooks, admin-only delete).
- Event pages with clickable website/description links (sanitized
  rich text), preview and shortlist views.

## Teams

- Create/rename with invite codes (HMAC, hashed at rest, TTLs);
  join by code; size rule 1–4; one LEADER enforced at the DB;
  leave with last-member warning + confirm (no password); kick,
  transfer, token regeneration; roster locks on submit/phase end;
  leaving as last member unregisters the viewer.
- Duplicate-submission similarity detection on submit.

## Submissions & gallery

- Draft auto-save, trackless drafts, finalize requires a track;
  screenshots/assets to SeaweedFS, Markdown, repo/demo URLs;
  **server-clock deadline enforcement** (403 past close).
- Public gallery: server ordering (oldest-first default, per-session
  seeded shuffle against positional bias), track/tag search,
  30-per-page, whole-card click to project page; drafts/hidden/
  in-progress-event work never leaks.
- Project pages with assets, event path, comments (Tier 3).

## Judging (Tier 2)

- Judge invites (participants can never be lifted to judge/organizer),
  track qualifications, manual + automatic conflict declarations.
- Assignment engines: round-robin and load-balanced k-cover
  (`judges_per_submission`, default 3); progress tracking; orphan
  reassignment on judge removal.
- Rubric workspace: weighted int/float criteria, draft auto-save,
  split-pane artifact view, score clearing, judge-private flags.
- Backend-enforced isolation: judges fetch only own assignments;
  peer scores 401/403; double-blind mode masks identities.
- Normalization: raw mean, per-judge z-score (population SD,
  zero-variance → 0), min-max 0–100, trimmed mean (n≥5);
  organizer picks the ranking column; pairwise Bradley-Terry mode.
- Streaming CSV exports (scores/judging/participants/full multi-section
  event export) with organizer guards.

## Community voting (Tier 3)

- Single-choice upvoting + quadratic voting (credit budget,
  cost = votes²); blind-vote mode hides live counts; results hidden
  until the window closes; per-session shuffled ballot order.
- Anti-abuse: header/IP fingerprinting, 15-req/min IP rate limiting,
  honeypot + sub-700ms timing bot traps, text-similarity duplicate
  flagging; append-only audit log of votes/scores/admin overrides.

## API-first operations (Tier 4)

- REST coverage of every feature with Zod validation; self-hosted
  OpenAPI 3.0 + Swagger UI at `/api/docs` (hand-rolled registry).
- Webhooks: organizer-registered endpoints, HMAC-signed, outbox worker
  with leases/retries, SSRF guard, test ping.
- Ed25519-signed results manifests/records with offline `verify`
  script + `/api/verify`; JWKS-like `/api/keys` with rotation.
- Server-side PDF certificates (participant + winner).
- Embeddable gallery widget (`/embed/[eventId]`, `public/embed.js`).
- Atomic JSON export/import CLI with FK-safe ordering and audit trail.
