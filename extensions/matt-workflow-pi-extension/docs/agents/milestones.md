# Milestone delivery arcs

GitHub milestones are optional human-facing delivery arcs for the Matt Pi workflow. They help the developer see how multiple specs and their implementation tickets contribute to a larger feature direction or release target.

## Conceptual hierarchy

```text
Milestone = strategic delivery arc
spec issue = coherent destination / feature proposal
Child issue = independently agentable tracer-bullet ticket
Labels = execution/readiness state
```

Milestones do not replace the spec -> child issue hierarchy. A child issue remains attached to a spec through the parent issue's generated `## Child issues` section, GitHub sub-issue metadata when available, or explicit issue references. Shared milestone membership alone is not enough to infer a parent/child relationship.

## Use milestones for

- Grouping multiple specs under a larger product or architecture outcome.
- Seeing progress toward a delivery arc in GitHub's milestone view.
- Finding what remains before a feature direction can be wrapped up.
- Reviewing open blockers, human decisions, and orphaned issues across related specs.

## Do not use milestones for

- Readiness state such as `ready-for-agent`, `needs-info`, or `ready-for-human`.
- Issue type/category state such as bug, feature, or refactor.
- Replacing spec issues or child implementation issues.
- Inferring an AFK work queue without explicit spec/child relationships.

## Spec association

When `/matt-spec` creates or updates a tracker spec, it may associate that spec with a GitHub milestone if the user explicitly asks or confirms. If the requested milestone does not exist, the agent should ask before creating it and confirm the exact title and optional due date.

## Child issue inheritance

When `/matt-tickets` creates child issues from a spec that already has a milestone, the child issues should usually inherit the same milestone for GitHub progress tracking unless the user says otherwise. The generated parent `## Child issues` section should note the milestone when applied.

## Auto mode

`/matt-auto` must not treat a milestone as a parent issue. If a milestone is supplied as a filter, auto mode may consider open `ready-for-agent` issues in that milestone, but it must skip spec/container issues and stop when relationships, blockers, or readiness state are ambiguous.

## Milestone review

Use `/matt-milestone [name|#]` for a read-only delivery-arc review. It should summarize:

- Milestone title, state, due date, and progress counts.
- spec/container issues in the milestone.
- Discovered child issues under each spec and their open/closed state.
- Ready-for-agent child/work issues.
- Issues in the milestone that are not linked to an obvious spec/container.
- Specs that have not been decomposed into tickets yet.
- Blockers, needs-info/ready-for-human items, and the next human decision needed.

Do not create, close, relabel, or mutate issues or milestones during `/matt-milestone` unless the user explicitly asks in a follow-up.
