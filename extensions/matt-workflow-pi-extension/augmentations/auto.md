# Matt workflow augmentation: auto review ledger

Record formats for the repo-local `.pi/matt-review-ledger.jsonl`, layered on top of the `/matt-auto` phase. Lifecycle rules (when to append, commit placement, and loop-log reporting) live in the auto phase prompt; this file owns the normative JSONL format and closed taxonomies.

## Append-only JSONL and provenance

Append one compact JSON object per line. Never rewrite, reorder, delete, migrate, or reformat existing records. Create `.pi/` and the ledger when needed. Use an ISO 8601 UTC timestamp in `date`.

Every new record requires `source`, with one of these closed values:

- `review-child`: outcome returned by the fresh review child
- `ai-gate`: outcome produced by the configured `toolchain.commands.aiGate`

Legacy records without `source` remain valid and mean `review-child`. This compatibility rule is validation-only: all newly appended records must include `source`.

## Finding record

For every novel finding, append one record with these fields:

- `date`: ISO 8601 UTC timestamp
- `issue`: GitHub issue number
- `cycle`: `initial`, `fix-1`, `fix-2`, or `fix-3`
- `verdict`: `PASS`, `FIX`, or `BLOCKER`
- `source`: `review-child` or `ai-gate`
- `location`: primary review location as `file:line`
- `severity`: source-reported severity, or `blocking` for gate execution/parsing failure
- `summary`: one-line finding summary
- `category`: one value from the closed category taxonomy below
- `whyMissed`: the source's stated reason, or the orchestrator's one-line classification of what the worker did not take into account
- `workerSkillPack`: skill IDs active for the implementation or fix worker in this cycle
- `repeat`: `none`, `earlier-cycle`, or `earlier-issue`; use `earlier-cycle` when substantially the same finding appeared in an earlier review cycle for this issue, otherwise `earlier-issue` when it appeared on a prior issue

The closed category taxonomy is:

- `spec-miss`
- `correctness`
- `test-gap`
- `convention-violation`
- `architecture`
- `verification-skipped`

Worked review-child finding:

```json
{"date":"2026-02-24T16:30:00.000Z","issue":42,"cycle":"fix-1","verdict":"FIX","source":"review-child","location":"src/parser.ts:27","severity":"major","summary":"Empty input bypasses the required validation error","category":"spec-miss","whyMissed":"Worker covered the happy path but did not check the empty-input acceptance criterion","workerSkillPack":["implement","tdd"],"repeat":"earlier-cycle"}
```

## Verdict-only PASS record

When a review surface succeeds with no findings, append exactly one verdict-only record. A new record contains only `date`, `issue`, `cycle`, `verdict`, and `source`; omit all finding-only fields (`location`, `severity`, `summary`, `category`, `whyMissed`, `workerSkillPack`, and `repeat`).

```json
{"date":"2026-02-24T16:40:00.000Z","issue":42,"cycle":"fix-2","verdict":"PASS","source":"review-child"}
```

## Review-child capture

After every initial or fix-cycle review child returns, append `source: "review-child"` records for that outcome: one per finding, or one verdict-only PASS when it reports no findings. Use the active issue, cycle, and implementation/fix worker skill pack.

## AI-gate capture and verdict mapping

When `toolchain.commands.aiGate` is configured, run it after every review child in the same issue/cycle and capture its outcome separately with `source: "ai-gate"`.

Map gate results deterministically:

- no findings → `PASS`
- actionable must-fix or should-fix findings → `FIX`
- execution/parsing failure or a non-remediable blocking result → `BLOCKER`

Append one record per novel gate finding. If the gate succeeds with no findings, append one source-tagged verdict-only PASS. For execution/parsing failure, append a blocking finding with category `verification-skipped`, severity `blocking`, and a concise failure summary; never silently omit failed gate evidence.

Every finding requires a primary `file:line`. When gate output supplies only a file path, inspect its evidence and the active diff to choose the most specific implicated line; if no narrower line can be established, use line 1. When execution/parsing fails without an implicated repo file, use `.pi/matt-conventions.json:1`, where the command is configured.

Use the active implementation/fix worker skill pack on AI-gate finding records. Combine both review surfaces when deciding the cycle outcome: `BLOCKER` takes precedence over `FIX`, which takes precedence over `PASS`.

## Same-cycle duplicate policy

Do not double-count an AI-gate finding already emitted by the same cycle's review child. Compare gate findings only with review-child findings from the same issue and cycle, before projecting them into ledger fields:

1. Normalize location by trimming whitespace, converting `\\` to `/`, removing one leading `./`, and normalizing `: line` to `:line`.
2. Normalize summary and evidence with Unicode NFKC, lowercase, trimmed/collapsed whitespace.
3. Treat findings as duplicates when normalized locations match and either normalized summaries or non-empty normalized evidence match.

Append only novel AI-gate findings. If every gate finding is a same-cycle duplicate, append no AI-gate record and report the suppressed duplicate count in the loop log; do not append a PASS because the gate did report findings. Across cycles and issues, preserve recurrence through the existing `repeat` field—never add a new repeat value implicitly.
