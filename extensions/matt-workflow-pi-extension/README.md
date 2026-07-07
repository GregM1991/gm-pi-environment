# Matt Workflow Pi Extension

Personal Pi package for Matt Pocock-style AI feature workflow orchestration.

The extension is intentionally thin: it loads the `matt-workflow` orchestrator skill, then each `/matt-*` command tells the agent which vendored Matt engineering skill files are relevant for the current phase.

## Commands

- `/matt-start <issue|brief>` — intake and next-phase recommendation
- `/matt-grill <issue|brief>` — human-in-loop alignment questions
- `/matt-prd <issue|brief>` — PRD / destination document
- `/matt-refactors <prd|issue>` — post-PRD review of out-of-scope grill refactors before slicing
- `/matt-slice <prd|issue>` — vertical-slice issue decomposition; when slicing a parent/PRD issue, records created child issues back on the parent
- `/matt-afk <issue|label>` — fresh-context single-issue AFK implementation loop
- `/matt-afk` — no-argument shorthand for the continuous auto-loop
- `/matt-auto [filter|parent]` — continuously implement, review, commit, and close ready-for-agent issues until blocked; when passed a parent/PRD issue, expands it into child issues and stops after the child queue is complete
- `/matt-route-skills <GitHub issue>` — read-only dry run that validates skill-routing config, fetches the issue with `gh`, and explains worker/review packs
- `/matt-init-skill-routes` — scaffold `.pi/matt-skill-routes.json` only, refusing to overwrite an existing config
- `/matt-init-conventions` — scaffold `.pi/matt-conventions.json` only, refusing to overwrite an existing config
- `/matt-review <diff|issue>` — fresh-context review
- `/matt-closeout <issue>` — verify completion evidence, draft/post completion comment, and close or relabel an issue
- `/matt-next <target>` — interactive phase picker
- `/matt-status` — workflow checklist/status
- `/matt-milestone [name|#]` — review a GitHub milestone as a human-facing delivery arc without implementing
- `/matt-arch-lens [target]` — quick high-level deep-module learning lens over an issue, diff, or feature context
- `/matt-arch-gym [target]` — interactive practice for spotting Module, Interface, Depth, Seam, Leverage, and Locality; the user answers first, then gets coaching
- `/matt-skills [phase]` — show phase-specific Matt engineering skill references
- `/matt-profile` or `/matt-help` — command summary and minimal boot command

## Parent and child issue workflow

When `/matt-slice` creates child issues from an existing parent/PRD issue, it updates the parent with a predictable `## Child issues` section. That section lists each child issue number/link, one-line purpose, readiness label recommendation, and dependency/blocker notes.

When `/matt-auto` receives a specific GitHub issue or issue URL, it inspects that issue before building the queue. If the issue appears to be a parent, PRD, epic, or container issue, auto mode does **not** implement or close the parent directly. It discovers child issues from explicit child/sub-issue sections, task-list issue references, slicing comments/metadata, GitHub sub-issue metadata when available, or clear linked issue relationships.

Auto mode then processes open, unblocked, `ready-for-agent` child issues serially, respecting dependency text such as `blocked by #123`. After each child closeout it re-checks queue state. It stops when every child issue is complete, when remaining children are blocked or need human input, or when the queue state is ambiguous. Parent issues are left open so the user can continue the Matt workflow pipeline manually.

## Milestone delivery arcs

GitHub milestones are optional human-facing delivery arcs above the normal Matt workflow hierarchy. They group related PRDs and their descendant implementation slices so a developer can see when a feature direction is ready to tie up in a bow.

The hierarchy remains:

```text
Milestone = strategic delivery arc
PRD issue = coherent destination / feature proposal
Child issue = independently agentable vertical slice
Labels = execution/readiness state
```

Milestones do **not** replace parent/child issue relationships and are not readiness state. `/matt-prd` may associate a confirmed milestone with a PRD. `/matt-slice` may inherit a PRD milestone onto created child issues for GitHub progress tracking. `/matt-auto` treats a milestone only as an optional queue filter; shared milestone membership alone is not enough to infer a PRD/child hierarchy.

Use `/matt-milestone [name|#]` to inspect an open delivery arc: PRDs, discovered child issues, ready-for-agent work, blockers, orphan milestone issues, and the next human decision needed. It is read-only by default and should not create, close, or mutate milestones unless explicitly asked in a follow-up.

See [`docs/agents/milestones.md`](./docs/agents/milestones.md) for the detailed convention.

## Install

From npm / Pi marketplace after publish:

```bash
pi install npm:matt-workflow-pi-extension
```

With npx, if you prefer invoking Pi without a global install:

```bash
npx pi install npm:matt-workflow-pi-extension
```

Local development install from this environment repo:

```bash
pi install /home/gm/workspace/pi-environment
```

## Direct invocation alias

Use this when you want a clean Matt-only Pi session instead of installing globally:

```bash
alias pi-matt='pi --no-skills --no-extensions \
  -e "$HOME/workspace/pi-environment/extensions/matt-workflow-pi-extension/index.ts" \
  --skill "$HOME/workspace/pi-environment/extensions/matt-workflow-pi-extension/skills/matt-workflow"'
```

Companion-extension variant:

```bash
alias pi-matt-full='pi --no-skills --no-extensions \
  -e "$HOME/workspace/pi-environment/extensions/matt-workflow-pi-extension/index.ts" \
  -e "$HOME/.nvm/versions/node/v22.18.0/lib/node_modules/pi-subagents/src/extension/index.ts" \
  -e "$HOME/.nvm/versions/node/v22.18.0/lib/node_modules/pi-web-access/index.ts" \
  --skill "$HOME/workspace/pi-environment/extensions/matt-workflow-pi-extension/skills/matt-workflow"'
```

## Grill notes and refactor extraction

During `/matt-grill`, codebase work may create a temporary top-level repo file named `MATT-GRILL-NOTES.md` after the first answered grill question or out-of-scope refactor finding. The Q&A section is append-only. The potential refactors section is editable/groupable and should include only candidates outside the PRD scope.

After `/matt-prd`, run `/matt-refactors` before `/matt-slice` when that file exists. This phase walks through out-of-scope refactor candidates, creates approved GitHub issues, then asks for explicit confirmation before deleting `MATT-GRILL-NOTES.md`.

## Architecture learning lens

The extension includes lightweight architecture-learning checkpoints based on the deep-module vocabulary from Matt's architecture skill. This is meant to exercise the user's own mental model while moving through the workflow, not to automatically perform a full architecture review.

Use `/matt-arch-lens [target]` for a compact teaching pass:

```text
/matt-arch-lens #82
/matt-arch-lens current diff
```

Use `/matt-arch-gym [target]` for interactive reps. The agent picks a small repo/issue example, asks the user to fill out this template, then coaches the answer:

```md
- Module/domain concept:
- Interface: what must callers know?
- Hidden caller knowledge:
- Deletion test:
- Seam: real or hypothetical?
- Leverage:
- Locality:
- Test surface:
```

Normal phase prompts also carry a lightweight reminder to use this lens only when architecture-sensitive, and to keep checkpoints short unless the user asks to go deeper.

## Repo conventions config

Commands that inject base phase context can read optional strict repo JSON at `.pi/matt-conventions.json` (`version: 1`). This file is a sibling to `.pi/matt-skill-routes.json`; it controls repo convention hints, not skill routing.

Config shape:

```json
{
  "version": 1,
  "tracker": {
    "type": "github-issues",
    "labelsDocPath": "docs/agents/triage-labels.md"
  },
  "toolchain": {
    "runtime": "bun",
    "commands": {
      "test": "bun test",
      "check": "bun run check",
      "build": "bun run build",
      "aiGate": "bun run ai-gate --base main --head HEAD"
    }
  },
  "docs": {
    "workflowDocPath": "docs/agents/matt-pocock-ai-feature-workflow.md",
    "extraContextDocs": []
  }
}
```

All sections are optional except `version`. If the file is absent, existing detection runs. If the file is present and valid, configured sections win and omitted sections fall back to detection independently. If the file exists but is invalid, every command that would send a base-context phase prompt hard-stops with diagnostics instead of silently falling back.

Doc paths must be repo-relative local paths, must stay inside the repo, and must exist on disk. `tracker.type` supports only `github-issues` in v1. Toolchain commands are hint-only; agents see them as preferred verification commands, but the extension does not execute them automatically. Supported command keys are `test`, `check`, `build`, and `aiGate`.

Use `/matt-init-conventions` to create the scaffold without overwriting an existing file.

## Issue-aware skill routing

Routing-aware commands use typed extension defaults plus optional strict repo JSON at `.pi/matt-skill-routes.json` (`version: 1`). Defaults keep the baselines small (worker: `implement`, `tdd`; review: `code-review`) and add ticket-specific routed skills only when issue labels/title/body/path hints provide evidence.

Config shape:

```json
{
  "version": 1,
  "limits": {
    "workerMaxRoutedSkills": 3,
    "reviewMaxRoutedSkills": 4
  },
  "skills": [],
  "routes": [],
  "disabledRoutes": [],
  "disabledSkills": []
}
```

Repo-defined skills must point to repo-relative local `SKILL.md` files inside the repo, for example `.pi/skills/domain/SKILL.md`. Route matching is positive-only and uses labels plus plain case-insensitive title/body/path substrings; no regex, negative `unless`, per-token confidence, or inferred tech-stack requirements are supported.

Use `/matt-route-skills #123` to validate config and explain selected worker/review packs before automation. `/matt-init-skill-routes` creates the scaffold only and refuses to overwrite. For GitHub issue targets, explicit file-like strings in the issue title/body are included as path evidence for route matching.

Routing-aware commands hard-stop on invalid config, missing selected routed skills, or high-confidence overflow. Medium-confidence overflow is trimmed to the active cap after dedupe. Repo `disabledSkills` affects routed skills only; it does not remove the baseline worker skills.

`/matt-slice` includes visible `## Agent skill hints` and machine-readable `matt-agent-skill-hints` JSON metadata in child issues when it creates them. These hints are low-authority diagnostics. `/matt-auto` and `/matt-afk <label>` still resolve the concrete queue issue inside their prompt-driven loops, so the extension cannot pre-route unresolved label/filter queues before launch; their prompts require routing the selected issue before implementation and stopping on invalid route results. Worker/review contracts include selected skill IDs, absolute `SKILL.md` paths, evidence-backed rationale, mandatory upfront reading guidance, and only a compact `Skill adjustments` note when the worker changes the proposed pack. Commit messages and closeout comments should describe the work and verification, not the skills used.

## Skill policy

- Loads only the local `matt-workflow` orchestrator skill by default.
- Phase prompts reference vendored Matt Pocock engineering skills under `vendor/mattpocock-skills/engineering/`.
- Phase prompts also reference local phase-scoped augmentation files under `augmentations/`.
- Treat `vendor/mattpocock-skills/` as upstream-owned/read-only: do not put local workflow customizations there.
- Track the vendored upstream source in `vendor/mattpocock-skills/SOURCE.json`.
- Refresh vendored upstream skills with `bun run sync:matt-skills`; preview the source ref with `bun run sync:matt-skills:dry-run`.
- Put local Matt workflow policy in `augmentations/<phase>.md`; upstream Matt skills remain the base workflow, and matching local augmentations win on conflict.
- All upstream categories except `deprecated` are vendored (engineering, productivity, misc, personal, in-progress) and registered as Pi skill paths. The vendored copy is the canonical source for Matt's skills across the whole environment; they are not duplicated in the environment's `skills/` directory.
- Vendored skills are exact upstream copies, including upstream's `disable-model-invocation` choices: skills upstream marks user-invoked stay user-invoked here.

Inspect mapping with:

```text
/matt-skills
/matt-skills grill
/matt-skills afk
/matt-skills review
```

## Updating vendored Matt skills

```bash
bun run sync:matt-skills:dry-run
bun run sync:matt-skills
bun run check
```

The sync command clones `https://github.com/mattpocock/skills`, replaces every vendored category directory (all except `deprecated`), copies the upstream license, and updates `vendor/mattpocock-skills/SOURCE.json` with the exact upstream commit.

After syncing, inspect `/matt-skills` and `index.ts` for renamed or newly useful skills before publishing, and check whether upstream added skills that duplicate a job owned by a skill in the environment's `skills/` directory (upstream wins; prune the local one).

## Verify

```bash
bun run check
bun test
pi --no-skills --no-extensions \
  -e "$PWD/index.ts" \
  --skill "$PWD/skills/matt-workflow" \
  -p /matt-profile
```

## License

This extension is MIT licensed. Vendored Matt Pocock skills are MIT licensed; see `vendor/mattpocock-skills/LICENSE`.
