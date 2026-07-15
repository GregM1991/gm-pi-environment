# Matt workflow augmentation: review-ledger retrospective

Analysis and proposal format for `/matt-retro`, layered on top of the review ledger record format in `auto.md`.

## Validation gate

Read `.pi/matt-review-ledger.jsonl` line by line before analysis. A valid line is one JSON object matching one of the two record shapes documented in `auto.md`: a finding record or a verdict-only PASS record. Validate required fields, cycle/verdict/category/repeat closed values, and the omission of finding-only fields from verdict-only records.

If the file is missing, contains no non-whitespace lines, or any line is malformed, stop. Report a missing or empty file plainly. For malformed content, report every invalid line number and a concise reason; do not analyze the valid subset.

The ledger is evidence only. Never rewrite, compact, reorder, reformat, or otherwise modify it.

## Cluster report

Group finding records by the closed `category` taxonomy and include counts plus issue/cycle references. Keep these signals distinct:

- **Within-issue repeats:** substantially repeated findings across fix cycles for one issue, including records marked `earlier-cycle`. These indicate that the fix-worker contract may not be resolving cited findings.
- **Across-issue patterns:** the same category or substantially similar finding across multiple issue numbers, including records marked `earlier-issue`. These indicate a possible gap in worker guidance, skills, routing, or repo instructions.

For each cluster, summarize recurring `whyMissed` themes without hiding the underlying records. Cite evidence as issue, cycle, category, and location when present.

## Improvement proposals

A proposal must contain:

1. A stable proposal number and short title.
2. Signal type: within-issue or across-issue.
3. Concrete target and change kind: add/edit/delete a target-repo `AGENTS.md`; edit an extension-local augmentation; edit `.pi/matt-skill-routes.json`; or create a new skill.
4. The exact intended change at a level the user can approve or reject.
5. Rationale citing the motivating ledger records by issue, cycle, and category.

Present one proposal at a time. Ask for explicit approval of that proposal and wait for the user's response before applying it or moving to the next. Approval never carries across proposals. Apply only approved proposals, preserve unrelated work, and report applied versus skipped proposal numbers at the end.

Never target or edit `vendor/mattpocock-skills`; local workflow policy belongs in `augmentations/`.
