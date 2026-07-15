# ADR 0003: Review-findings ledger

## Status

Accepted

## Context

Reviewer findings from `/matt-auto` previously survived only in child-agent responses and the final loop log. Repeated misses within one issue or across multiple issues therefore disappeared with the session, leaving no durable evidence for improving worker contracts, skill routing, repo guidance, or local workflow policy.

The workflow needs a repo-local artifact that preserves review outcomes across sessions while remaining compatible with the extension's prompt-driven architecture. Retrospective analysis must also fail safely when the evidence is incomplete or malformed rather than drawing conclusions from a valid-looking subset.

## Decision

Use `.pi/matt-review-ledger.jsonl` as an append-only, repo-local review ledger for `/matt-auto`.

The local [`augmentations/auto.md`](../../extensions/matt-workflow-pi-extension/augmentations/auto.md) file owns the normative record format. Finding records use a closed category taxonomy so trends remain comparable. A finding-free PASS review appends one verdict-only record containing only the date, issue, cycle, and verdict, which keeps pass rates and review-cycle counts computable without inventing finding data.

Ledger capture remains prompt-driven. The extension does not write records directly; the parent orchestrator performs the append after every initial or fix-cycle review because the auto-phase prompt requires it. Each append rides in the issue's single conventional commit and is exempt from the auto-loop dirty-worktree stop condition.

`/matt-retro` closes the capture → retro loop. It reads the ledger as evidence, distinguishes repeated findings within one issue from patterns across issues, and proposes concrete workflow changes for explicit per-proposal approval. Retro never rewrites the ledger. Missing, empty, or malformed ledgers are hard stops, and malformed records are reported with their line numbers before any analysis begins.

## Consequences

Positive:

- Review outcomes and recurring misses survive individual Pi sessions.
- Append-only JSONL keeps writes simple, reviewable, and resilient across auto-loop iterations.
- The closed taxonomy supports stable clustering while verdict-only PASS records preserve denominator data.
- Prompt-driven writes preserve the extension's thin orchestration model.
- Strict full-ledger validation prevents retrospectives from presenting unsupported insight.
- Evidence can produce approved changes to local augmentations, repo guidance, routing config, or skills without modifying vendored content.

Negative:

- The ledger grows indefinitely unless a future decision introduces archival policy.
- Prompt-driven capture depends on the orchestrator following the phase contract correctly.
- A closed taxonomy may require a deliberate schema decision when genuinely new finding classes emerge.
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
