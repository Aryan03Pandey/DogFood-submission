
## Tier 3: Community Engagement, Voting Integrity & Threat Mitigation

### 1. Community Voting Engine
* Support for Single Choice Upvoting.
* Blind voting option maintaining hidden live counts during active voting phases.
* when users (not registered in that event) visit an event and if that event is in voting phase, "Vote for this Event" button.
* Vote button -> click -> goes to voting page for that event

Voting page for the event:
Lists all the submissions for the event, the users can click and see full details of the submission and vote for that submission.
Add Comments section in the submissions page
Allow the users to add their comments and see other's comments for a submission

Admin Dashboard:
Add a Voting tab below Judging tab
this shows all the info and analytics regarding voting to the admin
any tables are paginated and fixed heigts, include charts if relevant


### 2. Anti-Abuse System
* Fingerprinting combining HTTP client characteristics and local IP rate-limiting.
* Text-similarity detection flagging potential duplicate project submissions.
* Local non-cloud Honeypot challenges blocking automated submission scripts.
* Display the potential duplicate submissions to the admin in the Submissions Tab 

### 3. Positional Bias Mitigation
* Deterministic, per-session seeded random shuffling of submissions on the voting page to eliminate alphabet/time-based list bias.

### 4. Audit Log
* Append-only database event log recording all vote actions, score modifications, and administrative overrides.
