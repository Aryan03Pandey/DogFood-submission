# Tier 1 walkthrough — core lifecycle

Spec sentence: login, roles, create an event, form a team, submit a
project, edit until the deadline, deadline stops submissions, public
gallery. Checker lines 1–3 of `scripts/run.py`.

## 1. Login & roles

- Pages: `app/login/page.tsx`, `app/signup/page.tsx`.
- API: `POST /api/auth/register`, `POST /api/auth/login`
  (Argon2id verify → `createSession()` → `dogfood_session` cookie),
  `GET /api/auth/me`, `POST /api/auth/logout`.
  Service: `src/server/auth-service.ts`.
- Walk it: sign up → cookie set → avatar menu appears (`Navbar` →
  `UserMenu`). Global role stays PARTICIPANT; event roles come later.

## 2. Create an event

- SUPERADMIN opens `/console/events/new` → 7-step `EventWizard`
  (`components/console/event-wizard.tsx` + `wizard-steps/`):
  basics (title → auto-slug, shown and editable, locked after
  creation), description (TipTap rich text, sanitized), media
  (SeaweedFS uploads), timeline (past dates blocked), tracks, rules,
  prizes (zero allowed, lock-in acknowledgment).
- API: `POST /api/events` (superadmin only) creates the DRAFT shell;
  each step PATCHes (`app/api/events/[id]/…`). Early warnings are
  suppressed until the user tries to continue (validate-on-attempt).
- Publish: console Overview → Review & publish → Settings
  `GoLiveControl` → `POST /api/events/[id]/publish` (organizer +
  password). Phase derives from timestamps thereafter.

## 3. Form a team

- Event page (`app/hackathons/[slug]/page.tsx`) → Register creates a
  team (captain = LEADER) or join with invite code
  (`app/invite/page.tsx`, `POST …/teams/join` — HMAC code, hash at
  rest, TTL enforced).
- Manage at `…/team`: rename (never regenerates the code), leave
  (last-member warning + confirm, no password; last member out
  unregisters the viewer), kick/transfer (leader), cancel vs submit
  confirms never overlap. API: `app/api/events/[id]/teams/**`.
  Size rule 1–4, one LEADER — the latter enforced by a partial unique
  index, not just app code.

## 4. Submit & edit until the deadline

- `app/hackathons/[slug]/submit/page.tsx`: trackless draft auto-save,
  finalize requires a track; assets to SeaweedFS; repo/demo URLs.
- Service `createDraft()` (`src/server/submission-service.ts`):
  requires PARTICIPANT mapping, then `assertSubmissionWindow()` —
  past `submissionDeadline`, **every** write path 403s
  `SUBMISSION_CLOSED` against server clock. The checker POSTs to a
  closed fixture event and gets 4xx (403 NOT_REGISTERED fires first
  for team-less probers — still 4xx, still refused).
- My Projects (`/my-projects`) → project page (`/projects/[id]`)
  with assets and an onward event link.

## 5. Public gallery

- `GET /projects` — no auth needed, 200. Server orders oldest-first
  (or per-session seeded shuffle with `?seed=`); client paginates
  30/page with whole-card stretched links.
- Visibility (`isGalleryVisible`): finalized + unhidden submissions of
  PUBLISHED-effective events only. The fixture event is long past its
  close, so all 41 fixture projects show — the checker's title probe
  matches on page one.
