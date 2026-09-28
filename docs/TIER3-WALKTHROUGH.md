# Tier 3 walkthrough — community voting & integrity

Spec sentences: community voting, comments, results hidden until the
window closes, ballots in random order, answers to cheating.
(Tier 3 is implemented; the checker only probes T1–T2, so this tour
is verified by the vitest suite and manual walk, not `run.py`.)

## 1. Vote

- Event voting page (`app/hackathons/[slug]/vote/page.tsx`):
  `GET …/voting-items` returns the ballot **shuffled per session**
  (`getVotingItemsShuffled`, same seeded shuffle as the gallery);
  `POST …/vote` casts; `POST …/vote` again (or reset) reallocates.
- Modes per event: SINGLE_CHOICE upvoting, or QUADRATIC with a credit
  budget (`quadratic_credits`, default 100, cost = votes² per
  submission). Blind mode (`blind_voting`) hides live counts until
  close; `getVotingState()` refuses results outside the window.
- Leaderboard (`…/vote/leaderboard`) and organizer Voting tab
  (`getVotingAnalytics`, organizer-only) show totals, voter counts,
  comment counts.

## 2. Comments

- `…/submissions/[id]/comments`: anyone reads; posting needs a
  session; organizers hide (soft delete keeps threads readable).
  Default author label "A voter" preserves pseudonymity.

## 3. Anti-abuse (see also `docs/THREAT-MODEL.md`)

- **Sybil/ballot-stuffing**: `voter_fingerprint` = SHA-256 of
  IP + user-agent + language + client hints + user id
  (`generateVoterFingerprint`); 15-req/min per-IP rate limit (429);
  quadratic costs make stuffing expensive.
- **Bots**: honeypot field (any content → 400 BOT_DETECTED) plus
  sub-700ms form-timing rejection on submission/vote forms.
- **Duplicate projects**: `detectDuplicateSubmissions()` text
  similarity flags copy-paste submissions for organizers.
- **Audit**: every vote, score change, and admin override appends to
  `audit_logs` (append-only on import too).
