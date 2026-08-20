# Auto Loop child contracts

Read this reference immediately before launching an Auto Loop implementation, fix, or review child. The Parent Orchestrator selects the role and retains queue, remediation-budget, commit, and closeout authority.

## Contract shared by every child

- Launch the matching builtin `worker` or `reviewer` with fresh context. The child completes only the assigned role and returns to the Parent Orchestrator; it launches no child orchestration of its own.
- Supply the absolute per-issue review-packet path. The child reads it as provided context, then independently inspects the issue, actual code, and current diff.
- Include the selected skill IDs, absolute `SKILL.md` paths, and evidence-backed rationale. The child reads applicable selected guidance before acting and returns `Skill adjustments: none` unless repo exploration supports a compact registered-skill adjustment.
- Add the current prompt-only `Known recurring pitfalls` precautions when the Review Ledger reference requires them.
- Keep the role bounded. The Parent Orchestrator alone launches reviews, chooses fix/review cycles, commits, and closes issues.

## Agreed Seam

A testing Seam recorded in the selected issue or its parent/spec is agreed and authoritative. When none is recorded, an unattended implementation or fix child may test through an existing public Interface. If the work would require inventing a new testing Seam, stop and return a human-decision blocker naming the missing decision; do not create a production Interface only for testing.

## Implementation child

Use the canonical `implement` guidance to deliver exactly the selected issue and canonical `tdd` guidance for vertical red-green slices at the Agreed Seam. Keep scope minimal and preserve unrelated worktree changes. Use focused tests while editing, then run one complete repo check and store its full output under the artifact reference.

Return:

- changed files and a compact diff summary;
- verification pass/fail, failing cases, and the private log path; and
- the compact `Skill adjustments` line.

The handoff contains no raw verification output. Review, commit, tracker mutation, and further agent launches remain Parent Orchestrator work.

## Fix child

Use the same implementation and TDD contract, limited to the concrete findings supplied by the Parent Orchestrator. Inspect the updated diff, preserve passing behavior, use focused tests, then run one complete repo check for this fix cycle and store it under the artifact reference.

Return the changed files, compact diff and verification evidence, log path, and `Skill adjustments` line. Product decisions, unclear acceptance criteria, an unavailable Agreed Seam, unpassable verification, or unsafe merge/conflict risk return as a human-decision blocker.

## Review child

Use canonical `code-review` guidance to review the fixed-point diff along both Standards and Spec axes. Inspect the issue/spec, repo instructions, context, ADRs, actual diff, and compact verification evidence. Stay in the reviewer role: produce evidence without implementing changes, opening an interactive workflow, committing, mutating tracker state, or launching nested orchestration.

Return exactly one outcome:

- `PASS` with no findings; or
- `FIX` / `BLOCKER` with each finding's primary `file:line`, severity, one-line summary, category, why it was missed, repeat classification and antecedent evidence required by the Review Ledger contract, plus a concrete fix.

A concrete repo-local `FIX` or `BLOCKER` is remediable evidence for the Parent Orchestrator. Reserve a human-decision blocker for product/design judgment, unclear acceptance criteria, unavailable Seam decisions, verification failure, or unsafe merge/conflict risk.

Completion criterion: each child performs one bounded role and returns enough compact evidence for the next Parent Orchestrator state transition without taking that transition itself.
