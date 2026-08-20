# Matt Workflow Pi Extension

Personal Pi package for Matt Pocock-style AI feature workflow orchestration.

The extension is intentionally thin: it loads the `matt-workflow` orchestrator skill, then each `/matt-*` command tells the agent which vendored Matt engineering skill files are relevant for the current phase.

## Commands

- `/matt-start <issue|brief>` — intake and next-phase recommendation
- `/matt-grill <issue|brief>` — human-in-loop alignment questions
- `/matt-wayfinder <destination|map|ticket>` — map and resolve planning decisions for large, foggy, multi-session work; never implements the destination
- `/matt-spec <issue|brief>` — spec / destination document
- `/matt-refactors <spec|issue>` — post-spec review of out-of-scope grill refactors before ticket decomposition
- `/matt-tickets <spec|issue>` — tracer-bullet ticket decomposition; when decomposing a parent/spec issue, records created child issues back on the parent
- `/matt-afk <issue|label>` — fresh-context single-issue AFK implementation loop
- `/matt-afk` — no-argument shorthand for the continuous auto-loop
- `/matt-auto [filter|parent]` — continuously implement, review, commit, and close ready-for-agent issues until blocked; when passed a parent/spec issue, expands it into child issues and stops after the child queue is complete
- `/matt-retro` — validate and analyze the review-findings ledger, then propose evidence-backed workflow improvements for explicit per-proposal approval
- `bun run review-ledger:append -- --describe` — print the current schema-owned record fields, closed taxonomies, and relationship contract without reading or modifying a ledger
- `bun run review-ledger:append -- --repo-root <path> --record '<json>' [--run-id <uuidv4>]` — validate and append a stamped untagged v2 review-ledger record to the target repo
- `bun run review-ledger:append -- --repo-root <path> --batch '<json-array>'` — atomically validate and append a complete tagged v2 PR-era review batch
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

## Wayfinder pre-spec path

Use `/matt-wayfinder` only when a destination is large, foggy, or expected to span multiple sessions. Chart mode creates a `wayfinder:map` and decision tickets (`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`) with explicit frontier/blocking edges. Work mode resolves exactly one decision ticket per session. A research ticket may use parallel research subagents, but the session still resolves only that ticket; HITL grilling/prototype tickets require the live user.

Wayfinder is planning, not implementation. `/matt-afk` and `/matt-auto` exclude every Wayfinder map and decision ticket even when a ticket is marked AFK or `ready-for-agent`. Once the map is clear, continue with `/matt-spec`, then `/matt-tickets`; normal implementation routing starts only from tickets that satisfy the existing readiness contract.

## Parent and child issue workflow

When `/matt-tickets` creates child issues from an existing parent/spec issue, it updates the parent with a predictable `## Child issues` section. That section lists each child issue number/link, one-line purpose, readiness label recommendation, and dependency/blocker notes.

When `/matt-auto` receives a specific GitHub issue or issue URL, it inspects that issue before building the queue. If the issue appears to be a parent, spec, epic, or container issue, auto mode does **not** implement or close the parent directly. It discovers child issues from explicit child/sub-issue sections, task-list issue references, ticket decomposition comments/metadata, GitHub sub-issue metadata when available, or clear linked issue relationships.

Auto mode then processes open, unblocked, `ready-for-agent` child issues serially, respecting dependency text such as `blocked by #123`. After the initial implementation review, it may run up to three fix/review cycles for concrete findings; each cycle uses a fix worker followed by a separate fresh reviewer. A concrete `FIX` or `BLOCKER` verdict continues while that budget remains—`BLOCKER` alone does not stop automation unless resolution requires human judgment or another safety stop. After each child closeout it re-checks queue state. It stops when every child issue is complete, when remaining children are blocked or need human input, when the three-cycle remediation budget is exhausted without a passing review, or when the queue state is ambiguous. Parent issues are left open so the user can continue the Matt workflow pipeline manually.

While an auto-mode child is running, the parent waits for its returned result without polling child status/process state or re-inspecting the repo. Harness attention notices for known-long verification commands mean keep waiting, unless the harness reports failure or a stall; normal diff, verification-evidence, and ledger inspection resumes after the child returns.

The parent is the current Pi session, so auto mode has no independent orchestrator-model setting. Use a dedicated `pi --model provider/model:thinking` session when the orchestrator should be cheaper than the builtin worker/reviewer children; configure those child roles through machine-local `subagents.agentOverrides`. Model changes on the parent are per-session, not per auto phase. The environment-level [investigation](../../docs/investigations/auto-loop-orchestrator-model-selection.md) documents precedence, overlay shape, and the missing command-specific capability.

Before launching any child for an issue, auto mode writes a temporary per-issue review packet outside the worktree at `${TMPDIR:-/tmp}/matt-auto-review-packets/<repo-id>/<issue>.md`, using the augmentation's base64url repository identity. It includes the issue and acceptance criteria, parent/spec reference, routing contract, relevant durable-doc/ADR references, and pointers to current diff and verification evidence. Implementation, fix, and review children receive its absolute path as provided context but must independently inspect the actual code and diff. Packet directories/files use private `0700`/`0600` permissions. Packets are never committed and are explicitly ignored by dirty-worktree handling. After issue closeout, auto mode deletes that issue's packet; on loop termination, it deletes all packets created by the run, removes the now-empty `<repo-id>` directory, and removes the packet root if it is empty.

Implementation and fix workers use focused tests while editing, then run one complete repo check when an implementation pass or fix cycle is complete. Full stdout/stderr is redirected to `.pi/matt-verification/<issue>-<stage>.log` in the Git-ignored `.pi/matt-verification/` directory (using the repo-local `.git/info/exclude` if needed). The three stage forms are `<issue>-initial.log`, `<issue>-fix-<n>.log` where `<n>` is the fix cycle number, and `<issue>-pre-commit.log`. The directory uses mode `0700` and logs use mode `0600`; handoffs include only pass/fail summary, failing cases, and the log path. Fresh review children receive this compact evidence and can read the log on demand. Logs are deleted after issue closeout or loop termination. That completed full check satisfies the mandatory pre-commit check while code and verification-relevant inputs remain unchanged. Routine review/ledger results, compact summaries, packet updates, and log bookkeeping do not trigger a duplicate check; actual remediation, code changes, or other verification-relevant input changes do.

## Auto-loop review ledger

`/matt-auto` appends review outcomes and findings to `.pi/matt-review-ledger.jsonl` in the target repo so review cycles, recurring misses, and pass rates remain available after the session. Every new append goes through the validating `review-ledger:append` command, which stamps the date and run identity and rejects invalid schema, run-discipline, or AI-gate cadence before writing. New records identify their provenance as `source: "review-child"` or `source: "ai-gate"`; source-less legacy records remain valid and are interpreted as review-child evidence. The file is append-only and is committed with the issue it describes—old lines are never migrated. Capture is auto-loop-only for now; `/matt-review` and targeted `/matt-afk` do not write it.

The executable schema Module is the sole owner of record fields, closed taxonomies, and structural relationship constants, and validation consumes those exports. Run `bun run review-ledger:append -- --describe` for the current agent-readable contract; describe mode is non-mutating and needs no target repo. [`augmentations/auto.md`](./augmentations/auto.md) owns the semantic capture rules and worked examples without maintaining a second vocabulary.

New PR-era evidence uses backward-compatible tagged v2 Review Run, Finding, confirmed GitHub Publication, and Recap records. The Review Run Summary is the only tagged pass-rate denominator; it binds producer/run identity to the evaluated full Subject SHA and preserves the observed verdict even when duplicate Finding records are suppressed. Complete tagged batches append atomically in canonical order. The schema-generated describe output is the normative field, taxonomy, and relationship contract.

When any append, including `source: "ai-gate"`, is marked `repeat: "earlier-issue"`, auto mode first compares it by judgment with recurring classes already recorded in the run and reuses a matching class's canonical key; only a genuinely new class derives a fresh key from category plus normalized summary. It immediately injects a prompt-only recurring-pitfall precaution into all remaining implementation/fix contracts. It also files or reuses one open human-triage prevention issue per recurring class, citing the ledger evidence and proposing guidance, routed-skill, and deterministic-check tiers; it never applies those durable policy changes itself. The canonical key is embedded verbatim in and searched for in prevention issues, and identifies the class consistently for injection, prevention-issue deduplication, and stopping. The first repeat does not stop the loop. Only recurrence of that class later in the same run, after injection, fires the prevention stop rule. The final loop log reports all guidance-promotion candidates, prevention issues, and stop-rule state.

When `toolchain.commands.aiGate` is configured, auto mode runs it exactly once per issue after the issue commit exists and before closeout. It records finding-free success as an AI-gate PASS, maps actionable findings to FIX, and records execution/parsing failure as a blocking `verification-skipped` finding. Gate findings that match any review-child finding for that issue by normalized location plus summary/evidence are suppressed so one miss is not counted twice; the loop log reports suppressed duplicates. A gate FIX or remediable BLOCKER triggers a fix worker and fresh review while fewer than three fix/review cycles have been used. If all three cycles are already consumed, auto mode stops with the budget-exhausted reason and does not close the issue. Any novel gate finding marked `repeat: "earlier-issue"` enters the same recurring-class prevention machinery as a review-child finding. The fix worker's completed full check satisfies the mandatory post-remediation/pre-commit verification requirement unless code or verification-relevant inputs change afterward; fresh review and ledger bookkeeping do not require a second identical check before updating the issue commit. The gate is not rerun. User-invoked `/matt-review` keeps its existing in-review gate behavior.

Run `/matt-retro` after enough records accumulate to close the capture → retro improvement loop. Retro validates mixed legacy/new ledgers before analysis, reports findings and pass rates separately for review-child and AI-gate evidence, separates repeat findings within one issue's fix cycles from patterns across issues, and cites source/issue/cycle records in concrete proposals. It prioritizes cross-issue clusters and proposes a prevention tier for each, preferring deterministic target-repo checks where feasible. It never rewrites the ledger or vendored Matt skills, and it applies only proposals the user explicitly approves one by one. Missing, empty, or malformed ledgers stop the retrospective; malformed lines are reported by line number.

## Milestone delivery arcs

GitHub milestones are optional delivery arcs for grouping related specs and implementation tickets. Use `/matt-milestone [name|#]` for a read-only review.

[`docs/agents/milestones.md`](./docs/agents/milestones.md) is the canonical agent reference for Milestone semantics, hierarchy boundaries, inheritance, Auto filtering, reporting, and mutations. Generated Phase messages point to it only when their active branch needs those rules.

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

During `/matt-grill`, codebase work may create a temporary top-level repo file named `MATT-GRILL-NOTES.md` after the first answered grill question or out-of-scope refactor finding. The Q&A section is append-only. The potential refactors section is editable/groupable and should include only candidates outside the spec scope.

After `/matt-spec`, run `/matt-refactors` before `/matt-tickets` when that file exists. This phase walks through out-of-scope refactor candidates, creates approved GitHub issues, then asks for explicit confirmation before deleting `MATT-GRILL-NOTES.md`.

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

Commands that inject base phase context can read optional strict repo JSON at `.pi/matt-conventions.json` (`version: 1`, `version: 2`, or `version: 3`). This file is a sibling to `.pi/matt-skill-routes.json`; it controls repo convention hints and delivery policy, not skill routing.

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

Version 1 remains valid unchanged. Version 2 adds strict delivery policy:

```json
{
  "version": 2,
  "tracker": {
    "type": "github-issues",
    "labelsDocPath": "docs/agents/triage-labels.md",
    "requiredChecks": ["Fallow Audit / fallow-audit", "matt/ai-gate"]
  },
  "architecture": {
    "recapPrimitivesPath": "docs/architecture/recap-primitives.yaml"
  }
}
```

When a version 2 or version 3 `tracker` section is present, `requiredChecks` must be a non-empty, duplicate-free list of non-empty check names. Delivery resolution prefers native GitHub required policy, falls back to this configured list, and returns an explicit hard-stop when neither exists; observed check runs are never inferred as policy. The optional recap map reference has classifier semantics and is therefore separate from `docs.extraContextDocs`.

Version 3 retains version 2 delivery and architecture fields, but replaces bare extra-context paths with branch-scoped entries:

```json
{
  "version": 3,
  "docs": {
    "workflowDocPath": "docs/agents/matt-pocock-ai-feature-workflow.md",
    "extraContextDocs": [
      {
        "path": "docs/agents/security-review.md",
        "useWhen": "reviewing authentication or authorization changes"
      },
      {
        "path": "docs/agents/release.md",
        "useWhen": "preparing release closeout"
      }
    ]
  }
}
```

Each version 3 entry requires exactly `path` and `useWhen`. The path must name an existing repo-local document, and `useWhen` must be a non-empty description of the workflow branch that requires it. Agent hints include both fields. Versions 1 and 2 continue accepting string arrays and preserve their existing hint formatting; migrate a repository to version 3 only after converting every extra-context string to an object.

Doc paths must be repo-relative local paths, must stay inside the repo, and must exist on disk. This includes version 3 `docs.extraContextDocs[].path` and `architecture.recapPrimitivesPath`. `tracker.type` supports only `github-issues`. Most toolchain commands are hint-only; agents see them as preferred verification commands, but the extension does not execute them automatically. Supported command keys are `test`, `check`, `build`, and `aiGate`.

`toolchain.commands.aiGate` is optional and review-specific. When present, `/matt-review` prompts require the agent to run that command and fold must-fix/should-fix findings into the verdict, or report the gate failure explicitly. `/matt-auto` instead runs the command exactly once per issue after the issue commit and before closeout, and captures the gate as a distinct ledger source using the mapping and per-issue deduplication contract in [`augmentations/auto.md`](./augmentations/auto.md). Example: `"aiGate": "bun run ai-gate --base main --head HEAD"`.

Use `/matt-init-conventions` to create the scaffold without overwriting an existing file.

## Normalized GitHub PR evidence

Delivery callers consume GitHub PR state through the `github-evidence` Module rather than treating observed checks as repository policy. Its Adapter Interface reads PR/head identity, native required policy, check runs, legacy commit statuses, check annotations, review summaries, and GraphQL review threads. Native policy wins; callers may supply conventions-v2 required checks as fallback, and absence of both is an explicit hard stop.

`collectGithubEvidence()` returns the complete normalized observation surfaces plus a compact packet containing only required blocking checks, blocking annotations and review summaries, unresolved non-outdated threads, optional browser state, and exact evidence/refresh references. `reconcileGithubEvidence()` supports external wakeups or polling at 15 seconds for the first 2 minutes, 30 seconds through 10 minutes, then 60 seconds; it honors rate-limit waits within fixed 30-minute per-head and 90-minute per-transaction budgets. A timeout keeps unfinished checks pending rather than relabeling them failed.

The Module is transport-independent: production delivery code supplies a GitHub Adapter, while behavior tests use deterministic Adapters for pagination, permissions, rate limits, stale heads, unknown responses, wakeups, and time.

## GitHub review evidence publication

Delivery callers publish Matt-owned evidence through the `github-publication` Interface. Reviewer-child output is one native review containing a marked summary and marked finding threads. The Interface reads those stable run/finding markers back from GitHub before returning ledger-ready Publication records; retries and duplicate requests reconcile by marker, while partial, duplicate, permission-denied, or unresolved mutations block handoff.

The same Interface runs the AI gate once on the code Subject SHA and publishes `matt/ai-gate` as a check with finding-marked annotations. A later evidence head receives an exact projection of the captured conclusion, title, Subject marker, summary, annotations, and finding markers without repeating inference; divergent existing output blocks reconciliation. Check publication accepts a separate injected Adapter only after its capability probe reports externally supplied credentials for the configured expected GitHub App and exactly Checks write permission. Confirmed checks carry their creating App identity, and only checks attributed to that expected App reconcile. Repository credentials, foreign Apps, and GitHub App secrets read from repository state are not accepted.

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

`/matt-tickets` includes visible `## Agent skill hints` and machine-readable `matt-agent-skill-hints` JSON metadata in child issues when it creates them. These hints are low-authority diagnostics. `/matt-auto` and `/matt-afk <label>` still resolve the concrete queue issue inside their prompt-driven loops, so the extension cannot pre-route unresolved label/filter queues before launch; their prompts require routing the selected issue before implementation and stopping on invalid route results. Worker/review contracts include selected skill IDs, absolute `SKILL.md` paths, evidence-backed rationale, mandatory upfront reading guidance, and only a compact `Skill adjustments` note when the worker changes the proposed pack. Commit messages and closeout comments should describe the work and verification, not the skills used.

## Skill policy

- Loads only the local `matt-workflow` orchestrator skill by default.
- Phase prompts reference vendored Matt Pocock engineering skills under `vendor/mattpocock-skills/engineering/`.
- Phase prompts also reference local phase-scoped augmentation files under `augmentations/`.
- Treat `vendor/mattpocock-skills/` as upstream-owned/read-only: do not put local workflow customizations there.
- Track the vendored upstream source in `vendor/mattpocock-skills/SOURCE.json`.
- Refresh vendored upstream skills with `bun run sync:matt-skills`; preview the source ref with `bun run sync:matt-skills:dry-run`.
- Put local Matt workflow policy in `augmentations/<phase>.md`; upstream Matt skills remain the base workflow, and matching local augmentations win on conflict.
- Skill Sync preserves every upstream category except `deprecated` as an exact, inspectable vendored copy. Normal Pi discovery deliberately promotes only `engineering` and `productivity`; `misc`, `in-progress`, and any future unpromoted categories remain vendored without entering the runtime skill catalog. The vendored copy is canonical for Matt's skills across the whole environment, so they are not duplicated in the environment's `skills/` directory.
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
