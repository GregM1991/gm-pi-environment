---
name: matt-workflow
description: Thin orchestration skill for the Matt Pocock AI feature workflow extension. Use only as the always-loaded entrypoint when running pi-matt; phase-specific behavior should come from the vendored mattpocock/skills engineering files referenced by the extension for the current phase.
---

# Matt workflow orchestrator

This is intentionally a **thin** always-loaded skill.

Do not treat this file as the full workflow specification. The extension loads all vendored `mattpocock/skills` engineering skills into Pi and injects phase-specific references to narrow the current phase. Use only the Matt engineering skills that apply to the current phase and target.

## Operating rules

- Keep the current phase narrow.
- Do not jump from planning to implementation unless the user invoked the implementation phase.
- Do not close or relabel issues unless the user invoked `/matt-closeout`, invoked `/matt-auto`, invoked no-argument `/matt-afk`, or explicitly asked for issue closeout.
- In auto-loop mode, keep the parent session as orchestrator; implementation and review should run in separate fresh child contexts when subagent tooling is available.
- Use durable repo context: `AGENTS.md`, `CONTEXT.md`, relevant ADRs, relevant directory `AGENTS.md`, and named GitHub issues.
- Use GitHub Issues and the labels documented in `docs/agents/triage-labels.md` when tracker work is needed.
- Treat GitHub milestones as optional human-facing delivery arcs above PRDs: they can group multiple PRD issues and their descendant slice issues, but they do not replace the PRD -> child issue hierarchy and are not readiness state.
- Do not create, assign, or close milestones unless the user explicitly asks or confirms. `/matt-milestone` is status/review-oriented by default, not implementation-oriented.
- If a phase prompt lists Matt engineering skills that do not fit the task, skip them and briefly say why.
- Do not load, read, invoke, or reference non-engineering Matt skills or non-Matt skills while running this workflow unless an issue-aware skill routing contract explicitly selects a registered skill and provides its absolute `SKILL.md` path.

## Architecture learning lens

The workflow may include lightweight deep-module teaching checkpoints. These are for exercising the user's own mental model, not for turning every target into an architecture review.

Use the architecture terms consistently: **Module**, **Interface**, **Implementation**, **Depth**, **Seam**, **Adapter**, **Leverage**, and **Locality**.

When a target is architecture-sensitive, prefer short prompts that help the user practise recognition:

- What **Module** or domain concept is being touched?
- What does the **Interface** force callers to know beyond the type signature?
- Which hidden caller knowledge belongs behind the **Interface**?
- What does the deletion test say?
- Is the **Seam** real, with multiple **Adapters**, or hypothetical?
- Where would more **Depth** improve **Leverage** for callers or **Locality** for maintainers?
- Are tests exercising the **Interface**, or reaching through it into the **Implementation**?

`/matt-arch-lens` gives a compact teaching pass over a target. `/matt-arch-gym` is interactive practice: ask the user to answer first, then coach the answer using repo or issue examples. Keep both modes high-level unless the user asks to explore a candidate more deeply.

## Grill notes and refactor extraction

During GRILL / ALIGNMENT for codebase work, maintain a repo-local, top-level temporary scratch document named `MATT-GRILL-NOTES.md` when there is something to record. Create it lazily; do not create an empty file at phase start.

The document has two jobs:

1. Preserve grill Q&A decisions in an append-only numbered record so later phases do not rely on long conversation context.
2. Track potential refactors discovered during grilling that are outside the PRD scope. The refactor section may be updated and regrouped as understanding improves.

After PRD completion, run the formal refactor-review phase before slicing. In that phase, quickly walk the user through out-of-scope refactor candidates, decide which should become GitHub issues, create requested issues using the repo tracker conventions, then ask for explicit confirmation before deleting `MATT-GRILL-NOTES.md`. Do not move into slicing until the user has been prompted about deletion.

The extension owns the phase-to-engineering-skill mapping.

## Issue-aware skill routing

Routing-aware commands (`/matt-route-skills`, `/matt-init-skill-routes`, `/matt-slice`, `/matt-afk`, and `/matt-auto`) use `.pi/matt-skill-routes.json` plus typed extension defaults. Invalid routing config, missing selected skills, and high-confidence overflow are hard stops for implementation automation.

When a prompt includes a routing contract:

- Treat selected skill IDs and absolute `SKILL.md` paths as mandatory upfront guidance for the child agent.
- Keep baseline worker skills (`implement`, `tdd`) even if a repo disables routed skills.
- Let workers report only a compact `Skill adjustments` line (`none` if unchanged) after repo exploration; do not turn routing into an audit checklist.
- Do not name skills in commits or issue closeout comments.

When slicing, include visible `## Agent skill hints` and the machine-readable `matt-agent-skill-hints` JSON comment in child issue bodies. These hints are low-authority diagnostics; auto mode recomputes routing from the final child issue before implementation.

## Milestone delivery arcs

Milestones are for developer orientation and release/delivery tracking. Use them to answer: what larger arc are these PRDs part of, what remains before this direction can be tied up, and which PRDs or child issues are still open.

Keep the planning and execution hierarchy intact:

```text
Milestone = strategic delivery arc
PRD issue = coherent destination / feature proposal
Child issue = independently agentable vertical slice
Labels = execution/readiness state
```

When a PRD has a milestone, child issues created from that PRD may inherit the same milestone for GitHub progress tracking, but the parent PRD's `## Child issues` section remains the source of the AFK queue relationship. Shared milestone membership alone is not enough to infer parent/child relationships.
