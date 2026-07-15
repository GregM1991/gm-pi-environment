# Matt workflow augmentation: auto review ledger

Record formats for the repo-local `.pi/matt-review-ledger.jsonl`, layered on top of the `/matt-auto` phase. Lifecycle rules (when to append, commit placement, and loop-log reporting) live in the auto phase prompt; this file owns the JSONL format.

## Append-only JSONL

Append one compact JSON object on one line after every review child returns. Never rewrite, reorder, delete, or reformat existing records. Create `.pi/` and the ledger when needed. Use an ISO 8601 UTC timestamp in `date`.

For every finding, append one record with these fields:

- `date`: ISO 8601 UTC timestamp
- `issue`: GitHub issue number
- `cycle`: `initial`, `fix-1`, `fix-2`, or `fix-3`
- `verdict`: `PASS`, `FIX`, or `BLOCKER`
- `location`: review location as `file:line`
- `severity`: reviewer-reported severity
- `summary`: one-line finding summary
- `category`: one value from the closed category taxonomy below
- `whyMissed`: the reviewer's stated reason, or the orchestrator's one-line classification of what the worker did not take into account
- `workerSkillPack`: skill IDs active for the implementation or fix worker
- `repeat`: `none`, `earlier-cycle`, or `earlier-issue`; use `earlier-cycle` when substantially the same finding appeared in an earlier review cycle for this issue, otherwise `earlier-issue` when it appeared on a prior issue

The closed category taxonomy is:

- `spec-miss`
- `correctness`
- `test-gap`
- `convention-violation`
- `architecture`
- `verification-skipped`

Worked finding example:

```json
{"date":"2026-02-24T16:30:00.000Z","issue":42,"cycle":"fix-1","verdict":"FIX","location":"src/parser.ts:27","severity":"major","summary":"Empty input bypasses the required validation error","category":"spec-miss","whyMissed":"Worker covered the happy path but did not check the empty-input acceptance criterion","workerSkillPack":["implement","tdd"],"repeat":"earlier-cycle"}
```

## Verdict-only PASS record

When a PASS review has no findings, append exactly one verdict-only record. It contains `date`, `issue`, `cycle`, `verdict`, and `workerSkillPack`; omit all finding-only fields (`location`, `severity`, `summary`, `category`, `whyMissed`, and `repeat`).

```json
{"date":"2026-02-24T16:40:00.000Z","issue":42,"cycle":"fix-2","verdict":"PASS","workerSkillPack":["implement","tdd"]}
```
