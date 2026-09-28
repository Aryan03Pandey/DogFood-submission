# Dogfood 2026 Platform Feature Specification

This document defines the complete technical feature specification for the **Dogfood 2026** self-hostable hackathon submission and judging platform.

---

## Tier 1: Core Lifecycle & Foundational Mechanics

### 1. Self-Hosted Authentication & Session Engine
* **Argon2id Password Hashing:** User credentials hashed using Argon2id (`memory=64MB`, `iterations=3`, `parallelism=4`).
* **Encrypted Local Sessions:** Session tokens stored in HTTP-only, `SameSite=Lax` cookies mapped to local database session stores or PASETO tokens.
* **Role-Based Access Control (RBAC):** Rigid system roles enforced across all routes:
  * `ADMIN`: Full system configuration, database seeding, overrides, and publication.
  * `ORGANIZER`: Managing rubrics, tracks, schedule, and judge assignments.
  * `JUDGE`: Restricted to reviewing explicitly assigned submission queues.
  * `PARTICIPANT`: Managing team formation, project edits, and public voting.
* **Offline Local Dev Auth:** CLI command and seed flag to bypass email verification and swap active user contexts instantaneously during testing.

### 2. Lifecycle State Machine
* **Server-Clock State Management:** Enforces sequential transitions:
  1. `DRAFT`: Event configuration open; public access disabled.
  2. `REGISTRATION`: User registration and team formation enabled.
  3. `SUBMISSION`: Project editing and submission enabled.
  4. `JUDGING`: Submission edits locked; judge evaluation active.
  5. `PUBLIC_VOTING`: Public community voting enabled; judge scores finalized.
  6. `PUBLISHED`: Read-only historical state.

### 3. Track & Prize Allocations
* Custom track definition with localized rules, submission prompts, and prize tier assignments.

### 4. Team Engine
* **Cryptographic Invites:** Secure team joining via HMAC-SHA256 invite tokens.
* **Roster Constraints:** Dynamic size enforcement ($1 \le \text{Team Size} \le 4$).
* **Automatic Freezing:** Roster locks upon project submission or phase expiration.

### 5. Project Submission Pipeline
* **Draft Auto-Save:** Asynchronous persistence for project updates.
* **Rich Media Support:** Local file uploads (SeaweedFS/Local Disk) for screenshots/assets, Markdown rendering, and URL parsing for video/repository links.
* **Hard Deadline Enforcement:** API boundary validation against host server clock rejecting late payload submissions.

### 6. Public Searchable Gallery
* Server-paginated grid with multi-attribute filtering (track, tags) and full-text search. Hides unsubmitted drafts.

---

## Tier 2: Judging Engine, Role Isolation & Score Normalization

### 1. Algorithmic Judge Assignment
* **Round-Robin Assignment:** Equal distribution of projects across registered judges.
* **Load-Balanced $k$-Cover Assignment:** Guarantees each project receives a minimum of $k$ reviews while balancing judge queue lengths.
* **Conflict-of-Interest Filter:** Blocks judges from viewing or scoring projects from their own team or organization.

### 2. Rubric & Evaluation Workspace
* **Dynamic Rubrics:** Configurable multi-criteria rubrics with numerical scale limits and criteria weights ($w_i$).
* **Focused Workspace UI:** Split pane displaying project submission artifacts alongside scoring inputs with draft auto-saving.

### 3. Backend-Enforced Role Isolation
* **Query-Level Scoping:** Judges can fetch only submission records matching active assignment IDs in the database.
* **Double-Blind Mode:** Toggleable masking of participant identities on judge payload requests.
* **Score Isolation:** Scores remain invisible across judges until public results are published.

### 4. Normalization Algorithms
* **Raw Weighted Mean:** Standard weighted sum of rubric criteria.
* **Z-Score Normalization:** Standardizes individual judge scoring distributions:
  $$Z_{ij} = \frac{x_{ij} - \mu_j}{\sigma_j}$$
* **Min-Max Rescaling:** Adjusts individual judge score bounds to a normalized $[0, 100]$ scale.
* **Trimmed Mean:** Trims maximum and minimum score extremes for submissions with $\ge 5$ reviews.

### 5. Reporting
* Memory-efficient streaming CSV generator for raw scores, judge progress, and normalized rankings.

---

## Tier 3: Community Engagement, Voting Integrity & Threat Mitigation

### 1. Community Voting Engine
* Support for Single Choice Upvoting and Quadratic Voting ($C = v^2$).
* Blind voting option maintaining hidden live counts during active voting phases.

### 2. Anti-Abuse System
* Fingerprinting combining HTTP client characteristics and local IP rate-limiting.
* Text-similarity detection flagging potential duplicate project submissions.
* Local non-cloud Honeypot challenges blocking automated submission scripts.

### 3. Positional Bias Mitigation
* Deterministic, per-session seeded random shuffling of gallery items to eliminate alphabet/time-based list bias.

### 4. Audit Log
* Append-only database event log recording all vote actions, score modifications, and administrative overrides.

---

## Tier 4: API-First Operations, Cryptographic Verifiability & Extensibility

### 1. API Architecture
* 100% feature coverage via documented REST endpoints.
* Self-hosted OpenAPI 3.0 specification available at `/api/docs`.

### 2. Local Webhooks
* Event-driven HTTP POST notifications (`submission.created`, `judging.completed`, `results.published`) managed by an internal worker queue.

### 3. Cryptographic Records
* **Ed25519 Result Signing:** Exported result manifests signed with a local private key to allow offline result verification.
* **Local Certificate Generator:** Server-side PDF generation for participant and winner certificates.

### 4. Portable Embeds & Backup
* Standalone embeddable JS widget/iframe for external sites.
* Atomic JSON database backup and restoration CLI tools.

---

## Bonus Challenges Architecture

1. **Normalization Proof (+5):** Interactive comparison table in Admin workspace showing raw vs. normalized leaderboards on seeded fixture data.
2. **Pairwise Judging Mode (+5):** 1v1 project evaluation UI using the Bradley-Terry model to estimate global project rankings:
   $$P(i > j) = \frac{p_i}{p_i + p_j}$$
3. **Written Threat Model (+3):** Comprehensive `THREAT-MODEL.md` analyzing Sybil attacks, collusion, and code-level mitigations.
4. **API First (+3):** Production-ready OpenAPI 3.0 specification published alongside client stubs.
