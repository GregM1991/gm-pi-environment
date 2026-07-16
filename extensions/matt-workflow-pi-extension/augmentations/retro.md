# Matt workflow augmentation: review-ledger retrospective

Analysis and proposal format for `/matt-retro`, layered on top of the review ledger record format in `auto.md`.

## Validation gate

Read `.pi/matt-review-ledger.jsonl` line by line before analysis. A valid line is one JSON object matching one of the two record shapes documented in `auto.md`: a finding record or a verdict-only PASS record. Validate required fields, cycle/verdict/source/category/repeat closed values, `file:line` locations, and the omission of finding-only fields from verdict-only records.

Accept mixed ledgers. Treat source-less legacy records as `review-child`; a present `source` must be exactly `review-child` or `ai-gate`. Do not edit old lines to add the defaulted source.

If the file is missing, contains no non-whitespace lines, or any line is malformed, stop. Report a missing or empty file plainly. For malformed content, report every invalid line number and a concise reason; do not analyze the valid subset.

The ledger is evidence only. Never rewrite, compact, reorder, reformat, or otherwise modify it.

## Source report

Report review surfaces separately for `review-child` and `ai-gate`; never conflate their findings, PASS records, or rates.

For each source, report:

- finding count and category counts
- distinct recorded review executions, keyed by issue plus cycle plus source
- verdict-only PASS count and recorded pass rate (`PASS` executions divided by distinct recorded executions)
- issue/cycle references for findings and PASS records

Call out `ai-gate` `verification-skipped`/`BLOCKER` records as gate reliability failures, not worker correctness findings. A cycle with only per-issue gate duplicates suppressed across review cycles has no AI-gate ledger record and is therefore outside the recorded pass-rate denominator; do not infer a PASS from absence.

## Cluster report

Within each source, group finding records by the closed `category` taxonomy and include counts plus issue/cycle references. Then compare sources only to identify corroboration; do not add corroborated findings together as independent misses. Keep these recurrence signals distinct:

- **Within-issue repeats:** substantially repeated findings across fix cycles for one issue, including records marked `earlier-cycle`. These indicate that the fix-worker contract may not be resolving cited findings.
- **Across-issue patterns:** the same category or substantially similar finding across multiple issue numbers, including records marked `earlier-issue`. These indicate a possible gap in worker guidance, skills, routing, repo instructions, or deterministic verification.

Give cross-issue clusters explicit priority over within-issue signals. For every cross-issue cluster, propose a prevention tier: prefer a deterministic target-repo toolchain check when feasible because it makes the miss fail the worker's own verification; otherwise propose target-repo `AGENTS.md` guidance or a routed skill. Explain why the selected tier fits.

For each cluster, summarize recurring `whyMissed` themes without hiding the underlying records. Cite evidence as source, issue, cycle, category, and location when present.

## Improvement proposals

A proposal must contain:

1. A stable proposal number and short title.
2. Signal type: within-issue or across-issue.
3. Review source: `review-child`, `ai-gate`, or corroborated across both.
4. Concrete target and change kind: add/edit/delete a target-repo `AGENTS.md`; add/edit a target-repo deterministic toolchain check; edit an extension-local augmentation; edit `.pi/matt-skill-routes.json`; or create a new skill.
5. Prevention tier for every across-issue proposal: deterministic target-repo check, target-repo guidance, or routed skill.
6. The exact intended change at a level the user can approve or reject.
7. Rationale citing the motivating ledger records by source, issue, cycle, and category.

Present one proposal at a time. Ask for explicit approval of that proposal and wait for the user's response before applying it or moving to the next. Approval never carries across proposals. Apply only approved proposals, preserve unrelated work, and report applied versus skipped proposal numbers at the end.

Never target or edit `vendor/mattpocock-skills`; local workflow policy belongs in `augmentations/`.
