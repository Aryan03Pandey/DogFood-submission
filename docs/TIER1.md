# Dogfood 2026: T1 - Core Architecture Deep Dive

The T1 tier represents the fundamental operational skeleton of the hackathon platform. The primary constraint is that it must boot via a single `docker-compose up` command, operate completely offline, and remain robust against role manipulation, deadline bypasses, and system clock attacks.

## 1. Authentication, Authorization & Role Hierarchy

### Offline-First Authentication Pipeline

To operate without cloud identity providers, the platform relies on a self-hosted credential engine:

* **Storage & Hashing:** User passwords are hashed securely using **Argon2id** (`memory=64MB, iterations=3, parallelism=4`).

* **Session Management:** Opaque session tokens (cryptographically secure random strings) are stored in PostgreSQL/Redis. The client receives this token as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.

* **Zero-Trust Boundary:** JWTs are intentionally avoided for core sessions to ensure instant session revocation (e.g., if an Admin kicks an abusive user, their access drops immediately without waiting for a token expiry).

### Contextual Role Hierarchy

Permissions are isolated using an **Event-Contextual RBAC (Role-Based Access Control)** system. A user's role is not a global flag (except for instance Superadmins), but mapped to an `event_id`:

1. **SUPERADMIN:** Global instance owner. Creates events, manages infrastructure settings.

2. **ORGANIZER:** Maps to a specific event. Can configure dates, tracks, rubrics, and trigger phase changes.

3. **JUDGE:** Maps to a specific event. Can only view and evaluate submissions assigned to them.

4. **PARTICIPANT:** Base level. Can join/create teams and draft submissions.

### Offline Dev/Test CLI

Because email verification is impossible in a purely offline air-gapped environment, the platform includes a seeded environment setup:

* **The `dogfood-cli`:** A local CLI script inside the backend container.

  * `docker compose exec backend ./cli create-user --role=admin --email=admin@local`

* **Local Auth Switcher:** When `NODE_ENV=development` AND `OFFLINE_MODE=true` are detected in the `.env`, a frontend floating "Impersonation UI" appears. This allows a developer to instantly switch between a seeded Organizer, Judge, or Participant context with one click, bypassing the password requirement entirely for local testing.

### Supplementary Online Features (Production)

* **OAuth2 / OIDC Integrations:** In production, GitHub and Google OAuth2 should be enabled for 1-click registration.

* **Passkeys (WebAuthn):** Judges and Organizers can use FaceID/TouchID/Hardware Keys to authenticate securely without passwords.

* **Transactional Emails:** Integration with Postmark/SendGrid for password reset flows and login alerts.

## 2. Event Configuration & Lifecycle State Machine

### The State Machine

Hackathons are strictly time-bound. Instead of relying on manual toggles, the system uses a temporal state machine evaluated at the backend database boundary.
The Event model contains strict timestamps: `registration_start`, `submission_start`, `submission_end`, `judging_start`, `voting_end`.

* State transitions implicitly based on the server clock (`NOW()`):
  `DRAFT` → `REGISTRATION` → `SUBMISSION` → `JUDGING` → `PUBLIC_VOTING` → `PUBLISHED`

### Tracks & Prize Allocation

* **Dynamic Tracks:** Organizers can define multiple tracks (e.g., "Best Use of Local LLMs", "FinTech Track").

* **Immutable Prize Integrity:** To prevent organizer abuse or bait-and-switch tactics, the application enforces a strict rule: **Once an event state > `DRAFT`, prize values can only be increased, never decreased or removed.** This is enforced via a PostgreSQL trigger (`BEFORE UPDATE ON prizes`) that throws a constraint error if `new.amount < old.amount`.

* **Custom Eligibility Constraints:** Tracks contain a JSONB `eligibility_rules` payload. For example: `{"max_team_size": 2, "student_only": true, "required_tech": ["postgres"]}`. The submission API validates the team's metadata against this JSONB object before accepting the submission into the track.

## 3. Team Formation Engine

### Roster Management & State Locking

* **Roster Constraints:** Teams enforce a strict 1-4 member limit at the database level.

* **Roles:** Each team has 1 `LEADER` (who can kick members, transfer ownership, or delete the team) and `MEMBER`s.

* **State Locking:** The roster must freeze to prevent cheating. A team becomes locked (preventing joins/leaves/kicks) when:

  1. The project state changes from `DRAFT` to `SUBMITTED`.

  2. The global `registration_end` timestamp is passed.

### Offline Invite Tokens vs. Online Links

* **Fully-Offline Tokens (Air-gapped):** The backend generates a short, cryptographically secure alphanumeric token (e.g., `HR-8X2F-3J9`) stored hashed in the DB with a TTL (Time-to-Live). The leader copies this text. The invited member manually pastes this token into an "Enter Invite Code" UI.

* **Online Invite Links:** A URL format: `http://localhost:3000/invite?token=HR-8X2F-3J9`. When a user clicks this link, the frontend reads the query parameter and POSTs it to the join API.

* **Supplementary Online Features (Production):** The platform can dispatch SMTP emails directly to a user's inbox containing the magic join link.

## 4. Submission Pipeline

### Draft, Auto-Save, and Edit Workflow

* **Background Sync:** Submissions are created in a `DRAFT` state the moment a team is formed. As the user types, the frontend debounces input (e.g., 2 seconds of inactivity) and sends `PATCH` requests to the API.

* **Conflict Resolution:** To prevent two teammates from overwriting each other, the payload includes a `last_updated_at` timestamp. If the server detects a newer timestamp in the DB than what the client sent, it returns a `409 Conflict` to trigger a frontend refresh.

### Metadata Handling

* **Core Fields:** Title, Tagline (max 140 chars), Description (Markdown), Tech Stack (Array of strings).

* **Repository & Demo Links:** Must pass strict URI format validation (`^https?://`).

* **Containerized MinIO (Offline Storage):** For offline asset storage (logos, demo videos), the `docker-compose.yml` includes a **MinIO** container.

  1. Client requests an upload slot.

  2. Backend generates a MinIO Presigned URL.

  3. Client uploads binary data directly to MinIO.

  4. Client PATCHes the submission with the returned MinIO object path (`/submissions/assets/logo.png`).

### Server-Side Deadline Enforcement

Deadlines are **never** trusted from the client.

* **Middleware Interception:** A dedicated API middleware (`RequirePhase(SUBMISSION)`) intercepts all `POST`/`PATCH` requests to submission endpoints.

* It fetches the current server timestamp. If `NOW() > event.submission_end`, it immediately aborts with a `403 Forbidden: Submission deadline exceeded`.

### Supplementary Online Features (Production)

* **Cloud Storage Migration:** Seamlessly swapping MinIO out for AWS S3 / Cloudflare R2 by simply changing `.env` variables (`S3_ENDPOINT`).

* **Automated Link Verification:** Webhooks ping the submitted GitHub repository URL to ensure it is public and returns a `200 OK`.

## 5. Public Gallery & Visibility Engine

### Content & Scope

The gallery is the public face of the event.

* **Scope:** It is primarily **Event-wise** (e.g., `/events/dogfood-2026/gallery`), allowing scoped viewing of entries specific to one hackathon. However, a **Global Gallery** (`/explore`) exists to aggregate submissions across *all* past and present public events on the platform instance.

### Search Functionality (Offline)

Without external dependencies like Algolia, search is powered natively by PostgreSQL:

* **Full-Text Search (FTS):** A `tsvector` column indexes the `title`, `tagline`, and `description`. Queries are executed using `tsquery` to support stemming and ranking (e.g., searching "running" matches "run").

* **Fuzzy Tag Matching:** `pg_trgm` (Trigram extension) is used to power the tech-stack filtering, allowing typo-tolerance (e.g., searching "javscript" matches "javascript").

### Visibility Engine (Data Scoping)

Visibility is strictly enforced at the database query layer to prevent data leakage. A project is only returned to an unauthenticated/public user if it meets ALL the following criteria:

1. `submission.status = 'SUBMITTED'` (Drafts are excluded).

2. `submission.is_hidden = FALSE` (Organizers can manually hide abusive/spam projects).

3. `event.phase >= JUDGING` (Submissions are blind to the public until the submission deadline passes to prevent idea-stealing).

### Supplementary Online Features (Production)

* **Algolia / Meilisearch Integration:** Syncing the Postgres submission table to an external search index via webhooks for sub-millisecond, highly typo-tolerant search across millions of historical hackathon records.

* **CDN Caching:** Edges caching (Cloudflare) for the gallery API endpoints to handle massive traffic spikes during the public voting phase.