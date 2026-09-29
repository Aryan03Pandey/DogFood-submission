# Tier 4 — what's built and how to try it in the running portal

Everything below is live: backend routes are wired to real UI, not stubs. Each section lists what was built (backend + frontend), where to find it in the app, and a quick recipe to actually exercise it once `docker compose up` (or `pnpm dev` with Postgres/SeaweedFS reachable) is running.

Seeded accounts (`scripts/seed.ts`, password `DogfoodLocal1!` for all, or use the offline impersonation switcher when `OFFLINE_MODE=true`): `admin@local` (SUPERADMIN), `organizer@local`, `judge1@local`, `participant@local`.

---

## 4.1 — Signing & verification

**Backend**
- `src/lib/canonical-json.ts` — deterministic serialization the signatures are computed over.
- `src/server/crypto/keys.ts` — Ed25519 keypair lifecycle (generates on first boot, `0600` PEM at `SIGNING_KEY_PATH`, re-registers the public key in `signing_keys` on every load).
- `src/server/signing-service.ts` — `signEnvelope` / `verifyEnvelope`.
- `GET /api/keys` — public key listing (JWKS-like).
- `POST /api/verify` — verify any posted envelope; always 200 with `{valid, kid?, type?, reason?}`, never 422.
- `scripts/verify.ts` — standalone CLI verifier, no DB/network needed (`pnpm verify -- --file=x.json --key=pub.pem`).

**Frontend**
- **`/verify`** (public page, linked from the footer) — paste or upload a signed file, get a plain valid/invalid answer with the reason spelled out, plus a link to `/api/keys`.

**Try it:**
1. Export an event (see 4.3 below) to get a real signed file.
2. Go to `/verify`, upload it → should show **Valid — signed by key `<kid>`**.
3. Open the file in a text editor, change one character inside `"payload"`, save, re-upload → should show **Invalid — signature doesn't match**.

---

## 4.2 — Embeddable gallery widget

**Backend**
- `src/server/gallery-service.ts#getEventGalleryProjects` — event-scoped public feed (reuses the same visibility rules as the main gallery).
- `app/embed/[eventId]/page.tsx` + `public/embed.js` — the chrome-less iframe target and the loader script external sites paste in.
- `next.config.mjs` — CSP headers allowing `/embed/*` to be framed cross-site (everything else stays locked down).

**Frontend**
- **Console → select an event → Gallery tab → "Embed on your site"** — theme toggle, a copyable `<script>` snippet, and a live iframe preview right there in the panel.

**Try it:**
1. Log in as `organizer@local`, open Console, pick the seeded **"Sample Hack 2026"** event (its dates are in the past, so its gallery is already public) → Gallery tab. You should see a live preview with real fixture projects.
2. Pick an event that's still in an earlier phase (e.g. one you're actively building via the event wizard) → the panel should instead say **"Your embed goes live once submissions close and results publish"**, with the snippet still copyable.
3. Copy the snippet, paste it into any scratch HTML file, open it in a browser — it should render the same gallery.

---

## 4.3 — Export / import (signed, atomic)

**Backend**
- `src/server/export-service.ts` / `import-service.ts` — FK-ordered, deterministic, credential-excluding-by-default export; atomic (one transaction) import with a dry-run mode.
- Every export is now **signed** (ties directly into 4.1 — see `docs/TIER4.md`'s 4.3 section for the exact envelope shape).
- `GET /api/events/:id/export.json` — downloads a signed `.json` file.
- `POST /api/admin/import` — SUPERADMIN only, `?dryRun=&force=` flags.
- `scripts/cli.ts` — `export`, `backup`, `import [--dry-run] [--force]` for the same thing from the command line.

**Frontend**
- **Console → select an event → Event Settings → "Export"** — anyone who manages that event can download it.
- **Console → select an event → Event Settings → "Import data (instance-wide)"** — **SUPERADMIN only**. Not scoped to the selected event — it's a whole-instance restore.

**Try it:**
1. As `organizer@local` (or `admin@local`), Console → an event → Event Settings → **Export event (JSON)** — a file downloads.
2. Log in as `admin@local` (SUPERADMIN — the Import section only appears for this role). Console → Event Settings → choose that same file → **Run dry run**. You'll see row counts per table. If the instance already has real data, you'll be asked to check **"Force overwrite"** and dry-run again.
3. Click **Apply**, confirm the second click, done — a green summary appears, and any users whose password wasn't included get flagged as needing a reset.

---

## 4.4 — REST coverage, OpenAPI docs, API tokens

**Backend**
- `src/server/openapi.ts` — one registry, now covering every route in the app (~54 paths), including the ~40 event/team/profile routes that existed with no OpenAPI entry before this pass.
- `GET /api/openapi.json`, `GET /api/docs` (Swagger UI, bundled — no CDN).
- `src/server/token-service.ts` + `api_tokens` table — bearer tokens (`dfk_...`) that authenticate exactly like a session cookie, resolved in `src/server/http.ts`.
- `POST/GET /api/tokens`, `DELETE /api/tokens/:id`.

**Frontend**
- **Footer → "API Docs"**, and **Console → left sidebar → "Manage" → "API docs"** (opens in a new tab).
- **`/settings`** (from the account/user menu → "Account Settings") — create a token, copy the raw value **once**, see name/prefix/dates for existing ones, revoke (two-click confirm).

**Try it:**
1. Click **API Docs** from the footer or console sidebar — full interactive Swagger UI, no login needed to browse it.
2. Log in as any user, go to the account menu → **Account Settings** → create a token named e.g. `ci-test`, copy it immediately (it won't be shown again).
3. From a terminal: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/auth/me` — should return your own account, proving the token works exactly like your session cookie.
4. Revoke it from `/settings`, retry the same `curl` — should now 401.

---

## 4.6 — Signed judge records & results manifest

**Backend**
- `src/server/records-service.ts` — `getJudgeRecord` (aggregate-only participation attestation,
  no scores/comments) and `getResultsManifest` (public, gated on the event's derived status being
  `PUBLISHED`).
- `src/server/assignment-service.ts#getPublishedRankings` — the same ranking math `getRankings`
  (organizer-only) uses, refactored so both share one `computeRankings` implementation.
- `GET /api/judge/records?eventId=&judge=` — signed judge-record envelope.
- `GET /api/events/:id/results-manifest.json` — signed, public results-manifest envelope.

**Try it:**
1. As `judge1@local`, `curl` (or the browser, logged in) `GET /api/judge/records?eventId=<sample-event-id>` — returns a `type: "judge-record"` envelope with only assigned/completed counts, no scores.
2. `GET /api/events/<id>/results-manifest.json` on an event that hasn't reached `PUBLISHED` yet → `409 RESULTS_NOT_PUBLISHED`. On the seeded fixture event (dates in the past) → `200` with signed rankings + vote totals, no login required.
3. Paste either envelope into `/verify` → **Valid**.

## 4.7 — Certificates

**Backend**
- `src/server/certificate-service.ts` — `pdfkit`-rendered PDF certificates (name/event/role/
  prize/date only, no email) plus a signed `type: 'certificate'` envelope for each one;
  `prize_awards` CRUD (`awardPrize`/`listPrizeAwards`/`revokePrizeAward`, organizer/superadmin).
- `GET /api/events/:id/certificates/participant/:submissionId` and `.../winner/:prizeAwardId`
  (`?format=json` for the envelope instead of the PDF, `?user=` for organizer oversight).
- `POST/GET /api/events/:id/prize-awards`, `DELETE /api/events/:id/prize-awards/:awardId`.

**Frontend**
- **Console → select an event → Judging tab → "Awards"** — pick a prize and a finalized
  submission, record the winner; recorded winners list with a revoke action.
- **A participant's own submission page (`/hackathons/:slug/submit`)** — "Download certificate"
  once finalized, plus "Download winner certificate — <prize>" if their submission won one.

**Try it:**
1. Log in as `organizer@local`, Console → an event with a finalized submission → Judging tab →
   Awards → pick a prize + submission → **Record winner**.
2. As a member of that team, go to `/hackathons/<slug>/submit` — both certificate buttons appear;
   download either.
3. Paste the PDF's accompanying envelope (`?format=json` on the same URL) into `/verify` →
   **Valid**.

## 4.5 — Local webhooks

**Backend**
- `src/server/webhook-service.ts` — register/list/revoke endpoints (organizer/superadmin,
  secret shown once), `enqueueWebhookEvent` (the outbox write).
- `src/server/webhook-url-guard.ts` — SSRF hardening on organizer-supplied URLs (scheme,
  compose-hostname blocklist, private/loopback/link-local IP checks), run at registration and
  again before every delivery.
- `src/server/webhook-delivery-service.ts` + `scripts/webhook-worker.ts` — the outbox worker:
  atomic claim-with-lease, HMAC-signed delivery, exponential backoff.
- Emitted events: `submission.created`, `judging.completed`, `results.published`.
- `GET/POST /api/events/:id/webhooks`, `DELETE /api/events/:id/webhooks/:webhookId`.

**Try it:**
1. Start a local listener to receive deliveries (anything that logs request headers/body works,
   e.g. `npx local-webhook-receiver` or a throwaway `nc -l`/small Express script on
   `http://localhost:9999/hook`).
2. As `organizer@local`: `curl -X POST http://localhost:3000/api/events/<eventId>/webhooks -H "Content-Type: application/json" -d '{"url":"http://localhost:9999/hook"}' --cookie "dogfood_session=<your session>"` — save the returned `secret`, it's shown once.
   (If your listener isn't reachable at a public-looking hostname, run the app with
   `WEBHOOK_ALLOW_PRIVATE_HOSTS=true` locally to skip the SSRF check.)
3. Finalize a submission for that event — a `submission.created` delivery should arrive at your
   listener with `X-Dogfood-Event`, `X-Dogfood-Timestamp`, and `X-Dogfood-Signature` headers.
4. Verify the signature yourself: `HMAC-SHA256(secret, "${timestamp}.${body}")` (hex) should equal
   the signature after `sha256=`.
5. `docker compose up` boots a `webhook-worker` service alongside `app` — check
   `docker compose logs webhook-worker` to see it polling.
