# Judging

# Judging

Judging is event-scoped. Organizers pass `eventId` in organizer request bodies and as a query parameter for progress, rankings, and judge queues. Event settings include `judgesPerSubmission` (default `3`) and `doubleBlindJudging` (default `false`).

## Judge API

- `GET /api/judge/queue?eventId=<uuid>` lists only the caller's assignments. The event parameter is optional when the judge serves multiple events. Double-blind events omit team names and members.
- `GET /api/judge/submissions/:id` returns submission details and the event rubric only when the caller has an assignment for that submission. Team identity is omitted for double-blind events.
- `GET /api/judge/scores` returns the caller's own scores. `?judge=<user-id>` is organizer-only for another judge; ordinary judges receive `403` and participants receive `403`.
- `POST /api/judge/scores` accepts `{ "assignmentId", "rubricScoresJson", "comment" }`. The assignment must belong to the caller. The server calculates the weighted total and marks the assignment done.
- `POST /api/judge/pairwise` accepts winner and loser submission IDs, both of which must be assigned to the caller in the same event.

## Organizer API

- `POST /api/organizer/judges` accepts `{ "eventId", "userId" }` and grants the event-scoped judge role.
- `POST /api/organizer/judges/:id/tracks` accepts `{ "eventId", "trackIds" }` and replaces the judge's qualified tracks.
- `POST /api/organizer/coi` accepts `{ "eventId", "judgeId", "teamId" }` for a manual conflict. Assignment generation also persists `team_member` and `same_org` conflicts inferred from team membership and organization.
- `POST /api/organizer/rubrics` creates a rubric or updates one when `id` is supplied. Criteria have stable IDs, labels, and non-negative weights.
- `POST /api/organizer/assignments/generate` accepts `{ "eventId", "trackId?" }` and runs load-balanced k-cover for submitted, visible projects. Conflicted judges are excluded; the response's `unresolved` list reports submissions with fewer than k eligible reviewers.
- `GET /api/organizer/assignments/progress?eventId=<uuid>` returns per-judge assigned, completed, and pending counts.
- `GET /api/organizer/rankings?eventId=<uuid>` returns raw mean, z-score mean, min-max score, and trimmed mean side by side.
- `GET /api/organizer/rankings/pairwise?eventId=<uuid>` returns Bradley-Terry strengths from submitted pairwise comparisons.
- `GET /api/export.csv?eventId=<uuid>` exports raw scores, assignment progress, and normalized ranking columns. Without `eventId`, organizers export events they manage; superadmins can export all events.

Every handler requires a valid session and checks event roles server-side. Judge score access is assignment-scoped; a query parameter never grants access to another judge's records.
