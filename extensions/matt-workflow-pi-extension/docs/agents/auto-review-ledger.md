# Auto Loop Review Ledger semantics

Read this reference after every Auto Loop review child, for recurring-class handling, and for the optional AI-gate branch. The executable schema owns record fields, closed taxonomies, and structural relationships; this reference owns semantic capture and loop effects without copying those closed lists.

## Validating append command

Before constructing records, read the current agent-facing contract through `(cd <extension-root> && bun run review-ledger:append -- --describe)`. Its output comes from the schema constants used by validation and does not read, create, lock, or modify a target ledger.

Append every new record through `(cd <extension-root> && bun run review-ledger:append -- --repo-root <target-repo-root> --record '<json>' [--run-id <uuidv4>])`. Supply the input fields from `--describe` without the command-stamped fields. The command generates the run UUID for the first untagged record; for additional findings from the same review execution, pass the returned `runId` with `--run-id`.

The command validates the complete existing ledger plus the candidate record before appending. It rejects malformed or out-of-taxonomy records, incompatible run reuse including PASS mixed with findings, duplicate finding identities, invalid repeat provenance, and a second AI-gate run for the same issue. A rejection prints a specific reason and exits non-zero without appending. Treat any rejection as a hard stop: never work around it by writing, echoing, or editing a JSONL line directly.

PR-era tagged records are appended atomically as a complete canonical batch through `--batch '<json-array>'`. Batch fields include their stable `runId`/event identities but omit `schemaVersion` and `date`, which the command stamps. The Interface writes nothing unless the whole batch and resulting mixed ledger validate. Canonical order is Review Run Summary, its Findings in `findingIds` order, confirmed Publications, then the final Recap after its referenced run. Do not submit a tagged record through one-record `--record`, because an incomplete tagged run is invalid by design.

## Loop lifecycle

After every initial or fix-cycle review child returns, append its complete outcome before deciding the next state. Ledger work is expected loop work and does not trigger the dirty-worktree stop rule. Keep `.pi/matt-review-ledger.jsonl` append-only, include its new records in the selected issue's single commit, and never create a ledger-only commit.

After recording an `earlier-issue` repeat, apply **Recurring-class identity** before the next child launch. Inject the resulting `Known recurring pitfalls` precaution, file or reuse the human-triage prevention issue, and stop only when the same class recurs later in the run after injection. The final loop log reports records appended per source and issue, suppressed AI-gate duplicates, every guidance-promotion candidate, its prevention issue, and whether the prevention stop rule fired.

## Append-only JSONL and versioning

Append one compact JSON object per line. Never rewrite, reorder, delete, migrate, or reformat existing records. Create `.pi/` and the ledger when needed. Use an ISO 8601 UTC timestamp in `date`.

Unversioned records are legacy. They continue to use the original finding or verdict-only PASS shapes exactly as before: `source` may be omitted and then means `review-child`, finding severity remains any non-empty string, finding verdict may be `PASS`, `FIX`, or `BLOCKER`, and verdict-only PASS omits `workerSkillPack`. Reject an unversioned record that adds v2-only fields. Mixed legacy/v2 ledgers are valid, and existing lines are never migrated.

Every newly appended record uses `schemaVersion: 2`. `--describe` is authoritative for required and optional fields and for the current closed values. One untagged v2 run is exactly one verdict-only PASS record or one-or-more finding records. Every record sharing a `runId` must share the relationship fields reported by `--describe`; never reuse a run ID for incompatible metadata.

## Tagged v2 PR-era records

Unversioned legacy and untagged v2 records above remain byte-compatible. New PR-era evidence uses `schemaVersion: 2` plus `recordType` and a full 40-character lowercase `subjectSha` naming the evaluated code commit, not a later ledger-only evidence head. `issue` and `pullRequest` are positive repository-local numbers; event identities are canonical lowercase UUIDv4 values.

- `recordType: "review-run"` contains `date`, issue/PR/cycle/source/run/worker-pack/Subject-SHA identity, `verdict`, ordered distinct `findingIds`, and non-negative `suppressedDuplicateCount`. It is the sole tagged denominator: each run counts once for its source, and only `PASS` is a success. Verdict is the highest observed disposition before duplicate suppression. PASS requires no findings and no suppressed duplicates; FIX/BLOCKER requires a finding or a positive suppressed count.
- `recordType: "finding"` contains the same run metadata plus the existing finding, severity, category, repeat, and antecedent fields. Its metadata must match the earlier Review Run, and the run's `findingIds` must exactly equal its following Findings in order.
- `recordType: "publication"` is appended only after GitHub confirms creation. It contains `publicationId`, issue/PR/Subject-SHA/source/run identity, optional `findingId`, `provider: "github"`, opaque globally unique `externalKey`, optional absolute `url`, and either `pr-review-summary` without a finding or `pr-review-thread` with an earlier finding in that run. Publication is transport, not producer identity. AI-gate checks/annotations and external feedback remain GitHub evidence, not ledger Publications.
- `recordType: "recap"` contains `recapId`, issue/PR/Subject-SHA, `source: "review-child"`, an earlier matching `runId`, impact/risk, and sorted unique touched/removed primitive and invariant IDs. Exactly one recap is allowed per issue/PR/Subject-SHA. Removed primitive IDs stay separate and force high risk; otherwise composes/extends/adds maps to low/medium/high. Recaps are informational and add no verdict or denominator.

Finding UUID, Publication UUID/external-key, Recap UUID/cadence, run identity, Subject-SHA, source, ordering, and repeat antecedent failures are reported against their JSONL line. Findings, Publications, Recaps, CI observations, and final check results add no pass-rate denominator.

## V2 finding record

For every novel finding, append one v2 finding record using the shape and source-specific closed values reported by `--describe`. Findings never use a PASS verdict. Reserve blocking severity for synthesized execution/parsing failures recorded as a blocking verification-skipped result. `whyMissed` states the source's reason or the orchestrator's one-line classification of what the worker did not take into account, and `location` names the primary `file:line`.

Repeat provenance is exact:

- `repeat: "none"` omits `repeatsFindingId`, `repeatsLegacyLine`, and `recurringClassKey`.
- `repeat: "earlier-cycle"` includes exactly one antecedent reference: `repeatsFindingId` for a strictly earlier v2 finding or `repeatsLegacyLine` for a strictly earlier unversioned finding's positive JSONL line number. The antecedent must use the same issue and a strictly earlier cycle. Omit `recurringClassKey`.
- `repeat: "earlier-issue"` includes exactly one antecedent reference under the same v2-ID/legacy-line rule, the antecedent must use a different issue, and `recurringClassKey` is required.

Worked review-child finding that repeats a v2 antecedent:

```json
{"schemaVersion":2,"date":"2026-02-24T16:30:00.000Z","issue":42,"cycle":"fix-1","verdict":"FIX","source":"review-child","runId":"f0972154-f921-4df1-9c25-ae684a47cfe4","workerSkillPack":["implement","tdd"],"findingId":"a1564dc6-eb2f-42ac-93a4-e60c97b2a419","location":"src/parser.ts:27","severity":"medium","summary":"Empty input bypasses the required validation error","category":"spec-miss","whyMissed":"Worker covered the happy path but did not check the empty-input acceptance criterion","repeat":"earlier-cycle","repeatsFindingId":"360204b2-ee3e-46b3-bf7d-17b1a4e7db74"}
```

## V2 verdict-only PASS record

When a review surface succeeds with no findings, append exactly one v2 verdict-only record. It contains only the v2 common fields plus `verdict: "PASS"`; `workerSkillPack` is required, while all finding-only and repeat-provenance fields are omitted.

```json
{"schemaVersion":2,"date":"2026-02-24T16:40:00.000Z","issue":42,"cycle":"fix-2","verdict":"PASS","source":"review-child","runId":"62bef605-bd95-49a4-aec3-d70e01bb3d8a","workerSkillPack":["implement","tdd"]}
```

## Review-child capture

After every initial or fix-cycle review child returns, generate one `runId` for that execution and append `source: "review-child"` v2 records for its outcome: one per finding with a distinct `findingId`, or one verdict-only PASS when it reports no findings. Use the active issue, cycle, and implementation/fix worker skill pack.

## Recurring-class identity

When classifying a v2 finding as `repeat: "earlier-issue"`, first compare it by judgment against the recurring classes already recorded in the current run. If it matches an existing class, assign it to that class and persist the class's existing key in `recurringClassKey`. Only a genuinely new recurring class derives a fresh deterministic key. For that derivation, normalize the closed `category` as-is. Normalize `summary` with Unicode NFKC, lowercase, trim and collapse whitespace, replace every maximal decimal-digit run with `#`, and remove other ASCII punctuation; then join category and normalized summary as `<category>|<summary>`. `whyMissed` and location are evidence, not identity. The persisted key is the canonical string for ledger analysis, the injected pitfall-note map, open prevention-issue search/deduplication (embed and search for it verbatim in the prevention issue body), and later-in-run stop-rule comparison. Thus all decisions share one identity.

## AI-gate capture and verdict mapping

When `toolchain.commands.aiGate` is configured, run it exactly once per issue, after the issue's review has passed and its commit exists, but before publication and closeout. Do not run it after review children. Capture its outcome separately with `source: "ai-gate"`, using the latest completed review cycle and the v2 record shape.

Map gate results deterministically:

- no findings → `PASS`
- actionable must-fix or should-fix findings → `FIX`
- execution/parsing failure or a non-remediable blocking result → `BLOCKER`

Append one record per novel gate finding, assigning one run UUID to the gate execution and a distinct finding UUID to each record. Classify each novel gate finding's `repeat` value under the v2 finding-record rules. Any novel AI-gate finding classified `repeat: "earlier-issue"` enters exactly the same recurring-class machinery as a review-child finding: assign its recurring class and key under **Recurring-class identity**, inject the pitfall note into all remaining implementation and fix-child contracts, file or reuse the prevention issue, and count it toward the prevention stop rule. If the gate succeeds with no findings, append one source-tagged verdict-only PASS. AI-gate severity and verdict combinations are deterministic: `must-fix` and `should-fix` use `FIX`; `non-remediable-blocker` uses `BLOCKER`; and `blocking` is reserved for synthesized execution/parsing failures, uses `BLOCKER`, and has category `verification-skipped`. For execution/parsing failure, append that blocking finding with a concise failure summary; never silently omit failed gate evidence.

Every finding requires a primary `file:line`. When gate output supplies only a file path, inspect its evidence and the committed issue diff to choose the most specific implicated line; if no narrower line can be established, use line 1. When execution/parsing fails without an implicated repo file, use `.pi/matt-conventions.json:1`, where the command is configured.

Use the active implementation/fix worker skill pack on AI-gate finding records. Combine the gate outcome with the review evidence for closeout: `BLOCKER` takes precedence over `FIX`, which takes precedence over `PASS`. A gate `FIX` or concrete remediable `BLOCKER` triggers a fix worker and fresh review while fewer than three fix/review cycles have been used. If all three cycles have already been consumed, stop with the budget-exhausted reason and do not close the issue. The fix worker's completed full check satisfies the mandatory post-remediation commit-preparation requirement unless code or verification-relevant inputs change afterward; the fresh review and ledger bookkeeping do not invalidate it, so do not require a second identical orchestrator-run complete check before updating the issue commit. Do not run the gate again after that review. The updated commit must still pass the target repository's normal pre-push hook and be published before closeout; a non-remediable gate failure blocks closeout.

## Per-issue duplicate policy

Do not double-count an AI-gate finding already emitted by any review child for that issue. Compare gate findings with review-child findings from the same issue, before projecting them into ledger fields:

1. Normalize location by trimming whitespace, converting `\\` to `/`, removing one leading `./`, and normalizing `: line` to `:line`.
2. Normalize summary and evidence with Unicode NFKC, lowercase, trimmed/collapsed whitespace.
3. Treat findings as duplicates when normalized locations match and either normalized summaries or non-empty normalized evidence match.

Append only novel AI-gate findings. If every gate finding is a same-issue duplicate, append no AI-gate record and report the suppressed duplicate count in the loop log; do not append a PASS because the gate did report findings. Across cycles and issues, preserve recurrence through `repeat` plus the required v2 antecedent reference and, for `earlier-issue`, `recurringClassKey`; never add a new repeat value implicitly.
