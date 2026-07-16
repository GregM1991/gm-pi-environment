# Matt workflow augmentation: auto review ledger

Record formats for the repo-local `.pi/matt-review-ledger.jsonl`, layered on top of the `/matt-auto` phase. Lifecycle rules (when to append, commit placement, and loop-log reporting) live in the auto phase prompt; this file owns the normative JSONL format and closed taxonomies.

## Per-issue review packet

Before launching any implementation, fix, or review child for an issue, write a packet outside the worktree at `${TMPDIR:-/tmp}/matt-auto-review-packets/<repo-id>/<issue>.md`. Derive `<repo-id>` from the repository root identity: use the canonical `owner/name` from the normalized `origin` URL when available, otherwise the real absolute worktree path; UTF-8 encode that identity, base64url encode it without padding, and prefix it with `gh-` or `path-` respectively. This is collision-safe and contains only `[A-Za-z0-9_-]`. Create the packet root and repository directory with mode `0700` and each packet with mode `0600` (correct existing modes before use). Never stage or commit this temporary artifact, and exclude it explicitly from dirty-worktree stop handling. Delete the issue packet after successful issue closeout; on every loop termination path, delete all packets created by that run, remove the now-empty `<repo-id>` directory, and remove the packet root if it is empty.

The packet contains the fetched issue body and acceptance criteria, parent/spec reference (or `none`), routing contract and selected skill pack, relevant ADR and durable-doc references (or `none found`), and commands/paths for the current diff and compact verification evidence. Update it as evidence changes. Every implementation, fix, and review contract names its absolute path and tells the fresh child to use it as provided context while independently inspecting the actual code and current diff.

## Verification evidence discipline

Implementation and fix children keep complete verification output in `.pi/matt-verification/<issue>-<stage>.log`. The three stage forms are `<issue>-initial.log`, `<issue>-fix-<n>.log` where `<n>` is the fix cycle number, and `<issue>-pre-commit.log`. Before writing logs, ensure `.pi/matt-verification/` is ignored by Git; use the repo-local `.git/info/exclude` when the target repo does not already ignore it. Create the directory with mode `0700` and each log with mode `0600`, correcting existing modes before use. Delete an issue's logs after successful closeout; on every loop termination path, delete all verification logs created by that run and remove the directory if empty. Child handoffs contain only the pass/fail summary, failing cases, and log path—not raw toolchain output. Review children receive that compact evidence and may read the repo-local log on demand.

Use focused tests during intermediate implementation and fix edits. Run the complete repo check once when the implementation pass or fix cycle is complete. That result satisfies the mandatory pre-commit full check if no code or verification-relevant inputs change afterward. Routine review results, ledger appends, compact summary or review-packet updates, and verification-log bookkeeping do not invalidate the completed check: proceed to commit without repeating it. Rerun the complete check immediately before the commit only after actual remediation, code changes, or other verification-relevant input changes, with output redirected to the issue's pre-commit log; never require two identical consecutive full checks.

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

## Recurring-class identity

When classifying a finding as `repeat: "earlier-issue"`, first compare it by judgment against the recurring classes already recorded in the current run. If it matches an existing class, assign it to that class and reuse the class's key. Only a genuinely new recurring class derives a fresh deterministic key without adding a ledger field. For that derivation, normalize the closed `category` as-is. Normalize `summary` with Unicode NFKC, lowercase, trim and collapse whitespace, replace every maximal decimal-digit run with `#`, and remove ASCII punctuation; then join category and normalized summary as `<category>|<summary>`. `whyMissed` and location are evidence, not identity. The assigned key is the canonical string for the injected pitfall-note map, open prevention-issue search/deduplication (embed and search for it verbatim in the prevention issue body), and later-in-run stop-rule comparison. Thus all three decisions share one identity while the ledger schema and taxonomies remain unchanged.

## AI-gate capture and verdict mapping

When `toolchain.commands.aiGate` is configured, run it exactly once per issue, after the issue's review has passed and its commit exists, but before closeout. Do not run it after review children. Capture its outcome separately with `source: "ai-gate"`, using the latest completed review cycle in the unchanged ledger record shape.

Map gate results deterministically:

- no findings → `PASS`
- actionable must-fix or should-fix findings → `FIX`
- execution/parsing failure or a non-remediable blocking result → `BLOCKER`

Append one record per novel gate finding. Classify each novel gate finding's `repeat` value under the unchanged finding-record rules. Any novel AI-gate finding classified `repeat: "earlier-issue"` enters exactly the same recurring-class machinery as a review-child finding: assign its recurring class and key under **Recurring-class identity**, inject the pitfall note into all remaining implementation and fix-child contracts, file or reuse the prevention issue, and count it toward the prevention stop rule. If the gate succeeds with no findings, append one source-tagged verdict-only PASS. For execution/parsing failure, append a blocking finding with category `verification-skipped`, severity `blocking`, and a concise failure summary; never silently omit failed gate evidence.

Every finding requires a primary `file:line`. When gate output supplies only a file path, inspect its evidence and the committed issue diff to choose the most specific implicated line; if no narrower line can be established, use line 1. When execution/parsing fails without an implicated repo file, use `.pi/matt-conventions.json:1`, where the command is configured.

Use the active implementation/fix worker skill pack on AI-gate finding records. Combine the gate outcome with the review evidence for closeout: `BLOCKER` takes precedence over `FIX`, which takes precedence over `PASS`. A gate `FIX` or concrete remediable `BLOCKER` triggers a fix worker and fresh review while fewer than three fix/review cycles have been used. If all three cycles have already been consumed, stop with the budget-exhausted reason and do not close the issue. The fix worker's completed full check satisfies the mandatory post-remediation/pre-commit verification requirement unless code or verification-relevant inputs change afterward; the fresh review and ledger bookkeeping do not invalidate it, so do not require a second identical complete check before updating the issue commit. Do not run the gate again after that review; a non-remediable gate failure blocks closeout.

## Per-issue duplicate policy

Do not double-count an AI-gate finding already emitted by any review child for that issue. Compare gate findings with review-child findings from the same issue, before projecting them into ledger fields:

1. Normalize location by trimming whitespace, converting `\\` to `/`, removing one leading `./`, and normalizing `: line` to `:line`.
2. Normalize summary and evidence with Unicode NFKC, lowercase, trimmed/collapsed whitespace.
3. Treat findings as duplicates when normalized locations match and either normalized summaries or non-empty normalized evidence match.

Append only novel AI-gate findings. If every gate finding is a same-issue duplicate, append no AI-gate record and report the suppressed duplicate count in the loop log; do not append a PASS because the gate did report findings. Across cycles and issues, preserve recurrence through the existing `repeat` field—never add a new repeat value implicitly.
