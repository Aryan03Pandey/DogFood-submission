# Tier 2 walkthrough — judging

Spec sentences: invite/assign judges, weighted rubric, peer-score
isolation, organizer progress view, documented harsh/generous
correction, CSV export. Checker lines 4–7. Full detail in
`docs/JUDGING.md`; this is the tour.

## 1. Invite & assign judges

- Console Judging tab → invite by email
  (`POST /api/organizer/judges`). Hard rule, both layers: an event
  PARTICIPANT can never be lifted to JUDGE (or ORGANIZER) — staffing
  and hacking are mutually exclusive (`assignEventRole`,
  `PARTICIPANT_IS_JUDGE` 409).
- Declare track qualifications and conflicts
  (`/api/organizer/judges/[id]/tracks`, `/api/organizer/coi`;
  COI rows also auto-block assignment).
- Generate: `POST /api/organizer/assignments/generate` runs the
  event's engine — ROUND_ROBIN rotation or load-balanced K_COVER
  (`judges_per_submission`, default 3) — skipping conflicts and
  existing pairs. Removing a judge reassigns orphans with the same
  engine and reports counts.
- Progress: `GET /api/organizer/assignments/progress` (per-judge
  completed/pending); rankings recompute from `scores`.

## 2. Score with a weighted rubric

- Organizer saves the rubric (`POST /api/organizer/rubrics`):
  criteria with weights, int/float kinds, min/max/step; validated
  (non-empty, unique ids, positive total weight).
- Judge workspace (`/judge` → queue → scoring split-pane):
  artifacts beside inputs, draft auto-save, `POST /api/judge/scores`
  (must own the assignment; criteria validated per step),
  clear/reopen, private flags
  (PLAGIARISM|OFF_TOPIC|INCOMPLETE|INAPPROPRIATE|OTHER).
- `rawTotal = weightedMean(criteria, rubric)` is frozen at write
  time, so later rubric edits never rewrite history.

## 3. Isolation (the check that matters most)

- `GET /api/judge/scores` defaults to self; `?judge=<other>` requires
  managing an event that contains that judge's assignments —
  otherwise 403. A judge's own fetch 200s; a peer probe, or any
  participant fetch, 401/403s. Enforced in `getJudgeScores()`, never
  in templates.
- Double-blind toggle (`double_blind_judging`) masks participant
  identities on judge payloads.

## 4. Normalization & export

- Per-submission columns: raw mean, per-judge z-score mean
  (population SD; zero-variance ballots contribute 0), min-max 0–100,
  trimmed mean (n≥5). Organizer picks the ranking column;
  see `docs/NORMALIZATION-PROOF.md` for the fixture-data proof
  (Salt Ledger raw-#1 → z-#3; Iron Switch → z-#1).
- Exports stream in batches so large events never balloon memory:
  `GET /api/export.csv?eventId=` (scores+j Rankings),
  per-area participants/submissions exports, and the full multi-section
  event CSV (`app/api/events/[id]/export/route.ts`) — all
  organizer-guarded.
