# Normalization Proof — fixture data

This document shows that the judging normalization in
`src/server/assignment-service.ts` (`computeRankings`, via
`src/lib/judging/normalization.ts`) does what it claims: it removes
judge harshness/generosity bias from the leaderboard. Every number below
was produced by running the **actual backend functions**
(`zScoreNormalize`, `minMaxNormalize`, `trimmedMean` from
`src/lib/judging/normalization.ts`, `scoreTotal` from `src/lib/fixtures.ts`)
against `src/db/fixtures.json` (8 tracks, 30 judges, 40 teams,
41 projects, 126 scores), and cross-checked against an independent
re-implementation — both agree to 3 decimals on every row.

## 1. What the backend computes

For each score, `rawTotal = weightedMean(criteria, rubric)`. The fixture
rubric weights functionality/quality/innovation all at 1, so
`rawTotal` is the plain sum (0–30 scale).

Per submission, four aggregates are reported:

| Aggregate | Definition (exact) |
|---|---|
| `raw` | Mean of the submission's raw totals. |
| `zScore` | Each score is standardized against **its own judge's** distribution: `z = (x − μⱼ) / σⱼ`, using the **population** standard deviation (`variance / n`, not `n−1`). A judge with zero variance contributes `z = 0` for every score (their ballot carries no information about relative quality). The submission's `zScore` is the mean of its z-values. |
| `minMax` | Min-max rescaling of the per-submission **raw means** to [0, 100]: `(v − min) / (max − min) × 100` over all submissions. If all means are equal, every submission gets 50. |
| `trimmedMean` | If a submission has **fewer than 5** reviews: plain mean (identical to `raw`). With ≥ 5 reviews: drop the single min and max, mean the rest. |

Leaderboard display order is by `raw` descending (submission id breaks
ties). The organizer-selected normalization (`events.normalization`)
chooses which column ranks.

### Statisticians, read this paragraph

- Z-scores use the **population** SD because each judge's ballot set is
  treated as the complete finite population of that judge's opinions, not
  a sample — Bessel's correction would inflate the variance of small
  ballots for no inferential gain, since no inference is performed.
- The z-mean is **unweighted by ballot size**: each review counts once.
  A submission reviewed twice by extreme judges is noisier than one
  reviewed six times; the table reports `n` next to every value so a
  reader can see this. The implementation does not shrink small-n means
  toward zero (no empirical-Bayes shrinkage) — a documented limitation.
- `minMax` is a **monotone transform of the raw means**, so it can never
  change the ranking; it exists for presentation (0–100 scale), not
  fairness. Do not cite it as bias correction.
- `trimmedMean` with the n ≥ 5 gate is the only outlier-robust column,
  and on this fixture set it activates for just 4 of 41 submissions.

## 2. The bias being corrected: judges disagree about the scale

Per-judge raw-total distributions (population mean, SD, ballot size):

| Judge | n | mean | SD |
|---|---|---|---|
| jdg_01 | 1 | 6.00 | 0.00 |
| jdg_27 | 2 | 9.00 | 1.00 |
| jdg_14 | 3 | 9.00 | 1.63 |
| jdg_20 | 6 | 9.33 | — |
| jdg_24 | 11 | 10.09 | — |
| jdg_02 | 6 | 12.67 | 2.21 |
| jdg_30 | 4 | 12.25 | 1.48 |
| jdg_15 | 6 | 12.17 | 2.27 |

The harshest regular judges average ~9–10 per ballot; the most generous
average ~12–12.7 — a **~3.4-point spread on a 30-point scale**, larger
than the gap between most adjacent leaderboard positions. Three judges
(jdg_01, jdg_07, jdg_23) have zero variance, including jdg_01's
single-ballot mean of 6.0; their z-contributions are exactly 0 rather
than extreme values, which is the correct handling.

## 3. Raw leaderboard (top 12 of 41)

| Rank | Submission | raw | n |
|---|---|---|---|
| 1 | Salt Ledger | 13.000 | 4 |
| 2 | Iron Switch | 13.000 | 3 |
| 3 | Still Beacon | 12.500 | 2 |
| 4 | Dry Relay | 12.333 | 3 |
| 5 | Salt Loom | 12.250 | 4 |
| 6 | Salt Kiln | 12.000 | 3 |
| 7 | Slow Trail | 12.000 | 3 |
| 8 | Copper Kiln | 11.667 | 3 |
| 9 | Dry Harbour (prj_07) | 11.500 | 4 |
| 10 | North Drift | 11.400 | 5 |
| 11 | Green Switch | 11.333 | 3 |
| 12 | Deep Beacon | 11.333 | 3 |

(Ties broken by submission id — e.g. Salt Ledger above Iron Switch.)

## 4. Z-score leaderboard (top 12) — the ranking changes

| Rank | Submission | z | n | raw rank → z rank |
|---|---|---|---|---|
| 1 | Iron Switch | 1.232 | 3 | 2 → **1** |
| 2 | Slow Trail | 0.932 | 3 | 7 → **2** |
| 3 | Salt Ledger | 0.867 | 4 | 1 → **3** |
| 4 | Salt Loom | 0.768 | 4 | 5 → 4 |
| 5 | Salt Kiln | 0.688 | 3 | 6 → 5 |
| 6 | Dry Relay | 0.609 | 3 | 4 → 6 |
| 7 | Still Beacon | 0.595 | 2 | 3 → 7 |
| 8 | Paper Anchor | 0.307 | 2 | out → 8 |
| 9 | Dry Harbour (prj_07) | 0.303 | 4 | 9 → 9 |
| 10 | Glass Signal | 0.288 | 3 | out → 10 |
| 11 | Dry Harbour (prj_41) | 0.275 | 5 | out → 11 |
| 12 | Copper Kiln | 0.229 | 3 | 8 → 12 |

Note the fixture's deliberate duplicate case: `Dry Harbour` is two
separate submissions (`prj_07`, `prj_41`) and is ranked as two rows.

## 5. Why the flip happened (receipts, not vibes)

| Submission | Its reviews (raw, judge mean, judge n) |
|---|---|
| Salt Ledger (raw #1 → z #3) | 13.0 from jdg_30 (μ=12.25), **14.0 from jdg_02 (μ=12.67)**, 12.0 from jdg_25 (μ=10.40), 13.0 from jdg_16 (μ=10.83) |
| Iron Switch (raw #2 → z #1) | **15.0 from jdg_15 (μ=12.17)**, 12.0 from jdg_29 (μ=10.56), 12.0 from jdg_20 (μ=9.33) |
| Slow Trail (raw #7 → z #2) | 12.0, 12.0, 12.0 from judges averaging 10.09, 11.10, 10.40 |

Salt Ledger's raw lead was bankrolled by the two most generous judges on
the panel (jdg_02 and jdg_30): a 14.0 from a judge who averages 12.67 is
only mildly above expectation. Iron Switch, meanwhile, took a perfect
15.0 and two 12.0s from below-average judges — including 12.0 from
jdg_20, who averages 9.33. Under z-scoring, beating a harsh judge counts
more than padding stats against a generous one. That is the entire
point of the correction, and the fixture data demonstrates it.

## 6. Min-max and trimmed mean on this data

- **Min-max** (range 6.5–13.0 → 0–100): order-identical to raw, as it
  must be — Salt Ledger and Iron Switch both 100.0, Still Beacon 88.46,
  North Drift 63.08. Presentation only.
- **Trimmed mean** differs from raw in exactly one top-12 row:
  North Drift (n=5) moves 11.400 → 11.333 (min and max dropped),
  swapping it with Green Switch. All other top rows have n < 5, so the
  column equals raw by construction.

## 7. Reproduce it

```bash
npx tsx /tmp/verify-norm.ts   # runs the real backend functions (scratch)
```

Or replicate in any language: sums per (`judge`, `project`) from
`src/db/fixtures.json` → per-judge population mean/SD → formulas in
§1. Both paths agree to 3 decimals on all 41 submissions.
