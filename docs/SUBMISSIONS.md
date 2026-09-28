
## 4. Submission Pipeline

### Draft, Auto-Save, and Edit Workflow

* **Background Sync:** Submissions are created in a `DRAFT` state lazily on first Make Submission visit (track-first creation, idempotent per team), so teams that never submit leave no orphan drafts. As the user types, the frontend debounces input (e.g., 2 seconds of inactivity) and sends `PATCH` requests to the API.

* **Conflict Resolution:** To prevent two teammates from overwriting each other, the payload includes a `last_updated_at` timestamp. If the server detects a newer timestamp in the DB than what the client sent, it returns a `409 Conflict` to trigger a frontend refresh.

### Metadata Handling

* **Core Fields:** Title, Tagline (max 140 chars), Description (Markdown), Tech Stack (Array of strings).

* **Repository & Demo Links:** Must pass strict URI format validation (`^https?://`).

* **Containerized seaweedfs (Offline Storage):** For offline asset storage (logos, demo videos), the `docker-compose.yml` includes a **seaweedfs** container.

### Server-Side Deadline Enforcement

Deadlines are **never** trusted from the client.

* **Middleware Interception:** A dedicated API middleware (`RequirePhase(SUBMISSION)`) intercepts all `POST`/`PATCH` requests to submission endpoints.

* It fetches the current server timestamp. If `NOW() > event.submission_end`, it immediately aborts with a `403 Forbidden: Submission deadline exceeded`.

Action flow:
Event in submissions mode (between submission start and submission end)
Event Page action button shows Make Submission state (already established)
Make submission -> click -> Submission page -> Enter details:
1. Title
2. Tagline
3. description -> max character limit 500
4. upload assets -> images, zips and videos -> enforce only a total submission asset size limit (100 MB; no per-file limit — a single file may use the whole budget) -> indicate used/total on UI as well

- Assets only saved to seaweedfs when submission is submitted in draft or final submission.
- Regular team members can make submissions in draft mode only, final submission locking remains with leader only -> password protected
- Delete option when submission in draft mode -> leader only, password protected
- Finalized submission can not be deleted, a submission can also not be deleted once submission date ends
- Individual-participation events auto-provision a 1-person team on first submit visit (submissions.teamId stays NOT NULL, no migration)
