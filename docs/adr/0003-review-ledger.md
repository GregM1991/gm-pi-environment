# ADR 0003: Review-findings ledger

## Status

Accepted

## Context

Reviewer findings from `/matt-auto` previously survived only in child-agent responses and the final loop log. Repeated misses within one issue or across multiple issues therefore disappeared with the session, leaving no durable evidence for improving worker contracts, skill routing, repo guidance, or local workflow policy.

The workflow needs a repo-local artifact that preserves review outcomes across sessions while remaining compatible with the extension's prompt-driven architecture. Retrospective analysis must also fail safely when the evidence is incomplete or malformed rather than drawing conclusions from a valid-looking subset.

## Decision

Use `.pi/matt-review-ledger.jsonl` as an append-only, repo-local review ledger for `/matt-auto`.

The local [`augmentations/auto.md`](../../extensions/matt-workflow-pi-extension/augmentations/auto.md) file owns the normative record format. Unversioned records remain valid under the legacy finding and verdict-only PASS shapes: `source` may be omitted and defaults to `review-child`, finding severity remains any non-empty string, and v2-only fields are rejected. Append-only history is never migrated.

Existing untagged records continue to use `schemaVersion: 2`, identify their source as `review-child` or `ai-gate`, and carry a UUID run identity plus the active `workerSkillPack`, including verdict-only PASS records. An untagged v2 run is either one PASS record or one-or-more finding records with UUID finding identities. Findings use the closed category taxonomy, source-specific severity vocabulary, and exact repeat provenance through a prior v2 finding UUID or legacy JSONL line; cross-issue repeats also persist their recurring-class key.

PR-era evidence expands v2 with tagged `review-run`, `finding`, `publication`, and `recap` variants while preserving every legacy and untagged line. The Review Run Summary is the sole tagged denominator and records the verdict computed from observations before duplicate suppression. Tagged records bind producer/run identity to the evaluated full Subject SHA and PR, while Publication describes confirmed GitHub transport rather than producer identity. Recaps record one final-head architecture impact/risk event without adding a verdict. Complete tagged batches append atomically in canonical run → findings → publications → recap order; relationship, recurrence, uniqueness, ordering, and cadence failures are line-numbered.

Ledger capture remains prompt-driven. The extension does not write records directly; the parent orchestrator performs the append after every initial or fix-cycle review because the auto-phase prompt requires it. When an AI gate is configured, the orchestrator runs it exactly once per issue after review passes and the issue commit exists, maps finding-free success/actionable findings/failure to PASS/FIX/BLOCKER, and records execution or parsing failure as blocking `verification-skipped` evidence. AI-gate findings that duplicate any review-child finding for that issue by normalized location plus summary/evidence are suppressed rather than double-counted. Each append rides in the issue's single conventional commit and is exempt from the auto-loop dirty-worktree stop condition.

`/matt-retro` closes the capture → retro loop. It reads the ledger as evidence, reports review-child and AI-gate findings/pass rates separately, distinguishes repeated findings within one issue from patterns across issues, and proposes concrete workflow changes for explicit per-proposal approval. Retro never rewrites the ledger. Missing, empty, or malformed ledgers are hard stops, and malformed records are reported with their line numbers before any analysis begins.

## Consequences

Positive:

- Review outcomes and recurring misses survive individual Pi sessions.
- Append-only JSONL keeps writes simple, reviewable, and resilient across auto-loop iterations.
- Closed source and category taxonomies support stable, source-specific clustering while legacy/untagged PASS records and tagged Review Run Summaries preserve denominator data.
- Producer identity, reviewed Subject SHA, confirmed publication identity, recurrence, and recap risk remain independently auditable without conflating GitHub transport with findings.
- Legacy source-less records remain analyzable without violating append-only history.
- Same-cycle deduplication prevents one corroborated miss from inflating finding counts.
- Prompt-driven writes preserve the extension's thin orchestration model.
- Strict full-ledger validation prevents retrospectives from presenting unsupported insight.
- Evidence can produce approved changes to local augmentations, repo guidance, routing config, or skills without modifying vendored content.

Negative:

- The ledger grows indefinitely unless a future decision introduces archival policy.
- Prompt-driven capture depends on the orchestrator following the phase contract correctly.
- Duplicate-only AI-gate executions have no source record and therefore sit outside recorded gate pass-rate denominators; the loop log must retain their suppressed count.
- A closed taxonomy may require a deliberate schema decision when genuinely new finding classes or provenance values emerge.
- One malformed historical line blocks retrospective analysis until the ledger is repaired outside `/matt-retro`.

## Alternatives considered

### Keep findings in session output only

This requires no durable artifact, but repeated review signals disappear when the session ends and cannot support evidence-backed workflow improvement.

### Have the extension write records directly

TypeScript-owned writes could enforce the schema mechanically, but would move lifecycle execution into the extension and conflict with the established prompt-driven orchestration model.

### Store one mutable JSON document or aggregate counters

A mutable document makes every update rewrite prior state and increases conflict or corruption risk. Aggregate counters also discard the issue, cycle, and finding evidence needed to distinguish within-issue remediation failures from across-issue patterns.

### Use an open category taxonomy

Free-form categories avoid schema changes, but spelling and naming drift would make clustering unreliable and weaken retrospective evidence.

### Record findings but omit finding-free PASS reviews

This captures failures but loses the denominator needed to compute pass rates and cycle counts from the ledger alone.
