# Tier claims & gaps

Committed claim (`.dogfood.toml`): **T1, T2 — both verified** by
`scripts/run.py` (see `acceptance-report.txt`: 7/7 PASS).
Policy, per `docs/spec.md`: claiming only what the checker verifies.
Overclaiming costs points; underclaiming verified work does not.

## T1 core — claimed & verified

Auth, event lifecycle, teams, submissions with enforced deadlines,
public gallery. All three checker probes pass against fixtures.

## T2 judging — claimed & verified

Assignment, weighted rubrics, backend peer-score isolation (the
heavily-weighted probe), organizer progress, documented normalization
(`docs/NORMALIZATION-PROOF.md`), CSV export. All four probes pass.

## T3 community — implemented, NOT claimed

Voting (single-choice + quadratic), comments, blind mode,
ballot shuffling, anti-abuse, audit log all exist and are covered by
vitest (`voting-tier3.test.ts` et al.). Not claimed because `run.py`
has no T3 probes — claiming it would be unverifiable by the grader.
Known gaps: no email verification for voters (fingerprint + rate
limit only), quadratic UX is organizer-configured but sparsely
documented in-UI.

## T4 stretch — implemented in slices, NOT claimed

REST/OpenAPI + tokens, webhooks + worker, Ed25519 records +
certificates, embeds, export/import CLI all exist. Not claimed (no
T4 probes in the checker). Known gaps/deferrals: pairwise mode is
judge-ballots + Bradley-Terry probability but has no full organizer
ranking UI; certificate design is minimal; webhook retries are
bounded, not eternal.

## Bonus challenges

- **Normalization proof**: this repo — `docs/NORMALIZATION-PROOF.md`
  with backend-executed numbers.
- **Threat model**: `docs/THREAT-MODEL.md`, honest about unstopped
  attacks.
- **API-first**: `/api/docs` + `openapi-spec.json`.
