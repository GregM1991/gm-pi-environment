# Milestone delivery arcs

GitHub milestones are optional human-facing delivery arcs for the Matt Pi workflow. They help the developer see how multiple PRDs and their implementation slices contribute to a larger feature direction or release target.

## Conceptual hierarchy

```text
Milestone = strategic delivery arc
PRD issue = coherent destination / feature proposal
Child issue = independently agentable vertical slice
Labels = execution/readiness state
```

Milestones do not replace the PRD -> child issue hierarchy. A child issue remains attached to a PRD through the parent issue's generated `## Child issues` section, GitHub sub-issue metadata when available, or explicit issue references. Shared milestone membership alone is not enough to infer a parent/child relationship.

## Use milestones for

- Grouping multiple PRDs under a larger product or architecture outcome.
- Seeing progress toward a delivery arc in GitHub's milestone view.
- Finding what remains before a feature direction can be wrapped up.
- Reviewing open blockers, human decisions, and orphaned issues across related PRDs.

## Do not use milestones for

- Readiness state such as `ready-for-agent`, `needs-info`, or `ready-for-human`.
- Issue type/category state such as bug, feature, or refactor.
- Replacing PRD issues or child implementation issues.
- Inferring an AFK work queue without explicit PRD/child relationships.

## PRD association

When `/matt-prd` creates or updates a tracker PRD, it may associate that PRD with a GitHub milestone if the user explicitly asks or confirms. If the requested milestone does not exist, the agent should ask before creating it and confirm the exact title and optional due date.

## Child issue inheritance

When `/matt-slice` creates child issues from a PRD that already has a milestone, the child issues should usually inherit the same milestone for GitHub progress tracking unless the user says otherwise. The generated parent `## Child issues` section should note the milestone when applied.

## Auto mode

`/matt-auto` must not treat a milestone as a parent issue. If a milestone is supplied as a filter, auto mode may consider open `ready-for-agent` issues in that milestone, but it must skip PRD/container issues and stop when relationships, blockers, or readiness state are ambiguous.

## Milestone review

Use `/matt-milestone [name|#]` for a read-only delivery-arc review. It should summarize:

- Milestone title, state, due date, and progress counts.
- PRD/container issues in the milestone.
- Discovered child issues under each PRD and their open/closed state.
- Ready-for-agent child/work issues.
- Issues in the milestone that are not linked to an obvious PRD/container.
- PRDs that have not been sliced yet.
- Blockers, needs-info/ready-for-human items, and the next human decision needed.

Do not create, close, relabel, or mutate issues or milestones during `/matt-milestone` unless the user explicitly asks in a follow-up.
