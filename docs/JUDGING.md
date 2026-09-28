# JUDGING — assignment, scoring, normalization

Implementation: `src/server/judging-service.ts` (orchestration),
`src/lib/judging/normalization.ts` (pure math), tables in
`docs/SCHEMA.md`. Console surface: dashboard Judging tab; judge
surface: `/judge`.

## 1. Judge assignment

Engines, chosen per event (`events.assignment_algorithm`):

- **ROUND_ROBIN** — deterministic rotation (`rotateOrder`) dealing
  the next eligible judge per submission.
- **K_COVER** (default) — `loadBalancedKCover()`: each submission gets
  `min(k, judges)` distinct judges (`judges_per_submission`, default
  3), always picking among currently least-loaded eligible judges
  (id tiebreak). Guarantees minimum coverage while balancing queues.

Eligibility filters, applied before either engine: judge must hold a
JUDGE mapping; declared conflicts (`conflicts_of_interest`) and the
judge's own team submissions are excluded; existing pairs are never
duplicated (`judge_submission_unique`). Removing a judge re-runs the
engine over orphaned assignments and reports orphan/reassign counts.

## 2. Rubrics & scoring workspace

One `rubrics` row per event; criteria carry `weight`, `minScore`,
`maxScore`, `kind` (int|float) and `step`, validated on save
(non-empty, unique ids, positive total weight). The judge UI is a
split pane (artifacts + inputs) with draft auto-save.
`POST /api/judge/scores` requires owning the assignment and validates
every criterion value; `rawTotal = weightedMean(...)` is frozen at
write time so rubric edits never rewrite history. Judges may clear
(reopen) their score and raise private flags
(`submission_flags`, one live per assignment).

## 3. Role isolation

- Score reads are assignment-scoped: `getJudgeScores()` serves self
  by default; `?judge=<other>` 403s unless the caller manages an
  event containing that judge's assignments.
- **Participants can never become judges**: `inviteJudge()` and
  `assignEventRole()` refuse to lift a PARTICIPANT mapping (409);
  organizers likewise can't be created from participants.
- `double_blind_judging` masks participant identities on judge
  payloads; flags stay judge-private until publish.

## 4. Normalization

Per submission (`computeRankings`): `raw` (mean of raw totals),
`zScore` (mean of per-judge population-z values; zero-variance
ballots contribute 0), `minMax` (raw means rescaled 0–100; all-equal
→ 50), `trimmedMean` (plain mean under 5 reviews, else drop extremes).
The event's `normalization` column selects the ranking column.
Pairwise mode records Bradley-Terry ballots
(`pairwise_comparisons`, P(i>j) = pᵢ/(pᵢ+pⱼ)).

Worked proof on fixture data — raw #1 Salt Ledger falls to z #3
while Iron Switch rises to #1 because its marks came from harsh
judges: `docs/NORMALIZATION-PROOF.md`.

## 5. Reporting

`getAssignmentProgress` (per-judge completed/pending),
`getRankings`, and batched streaming CSV (`streamCsvRows`, 500-row
keyset pages) power the dashboard and `GET /api/export.csv` — all
organizer-or-superadmin guarded.
