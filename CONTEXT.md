# Pi Environment

This context describes the personal Pi agent environment: a portable package of skills, extensions, prompts, and config used to orchestrate AI-assisted product development across machines, with the Matt workflow extension as the product pipeline.

## Language

### Environment & Distribution

**Pi Environment**:
The personal source-of-truth repo of shared skills, extensions, prompts, and portable config, installed as a Pi package on every machine.
_Avoid_: dotfiles repo, config backup

**Bootstrap**:
Applying the Pi Environment to a machine: copying global agent config and registering the environment package so `pi update --extensions` can reconcile it.
_Avoid_: manual setup, machine-local drift

**Shared Skill Library**:
The curated `skills/` directory available in every Pi session. Each skill owns exactly one Job; anything Matt's upstream repo owns is consumed from the Vendored Matt Skills instead of being copied here.
_Avoid_: skill dump, duplicate copies of upstream skills

**Local-only Skills**:
The per-machine `~/.agents/skills` scratch directory for experiments and overrides. Shared skills never live there, and same-named skills there cause collisions where only one copy wins.
_Avoid_: shared skills on a single machine

### Skills & Canonicality

**Job**:
The single outcome a skill exists to produce, and the unit of skill pruning: one skill per job. Skills are deduplicated by job, not by topic — a PR context canvas for a human and an LLM-conducted review are different jobs even though both are "review".
_Avoid_: topic cluster, area

**Canonical Skill**:
The one skill that owns a Job. When Matt Pocock's upstream skills repo has a skill for the job, that upstream skill is canonical and local alternatives are pruned or become Variants.
_Avoid_: duplicate skill, competing local fork

**Vendored Matt Skills**:
The read-only synced copy of upstream `mattpocock/skills` (all categories except deprecated) under the workflow extension's `vendor/` directory, pinned to an exact upstream commit in `SOURCE.json`. Local customizations never go here.
_Avoid_: local edits to vendor, drifted manual copies

**Skill Sync**:
The scripted refresh (`sync:matt-skills`) that replaces the Vendored Matt Skills from upstream and records the new pinned commit.
_Avoid_: manual copy-paste from upstream

**Augmentation**:
A phase-scoped local policy file layered on top of the Vendored Matt Skills; when an augmentation conflicts with an upstream skill, the augmentation wins. This is the only place local Matt-workflow deltas live.
_Avoid_: editing vendored skills, forking upstream skills

**Variant**:
A deliberately thin skill that provides an alternative entry point to a Canonical Skill rather than duplicating its job (for example the grilling family).
_Avoid_: near-duplicate skill

### Matt Workflow

**Phase**:
One narrow step of the product pipeline — intake, grill, PRD, refactors, slice, AFK, review, closeout, auto. A session works exactly one phase and does not jump ahead to later phases.
_Avoid_: stage-skipping, planning-to-implementation drift

**Fresh-context Session**:
A new Pi session spawned for implementation or review work so outcomes rest on durable artifacts (issues, docs, diffs) instead of long conversation history.
_Avoid_: long-conversation context as memory

**Grill Notes**:
The temporary top-level `MATT-GRILL-NOTES.md` created lazily during grilling: an append-only Q&A decision record plus an editable list of out-of-scope refactor candidates. It is deleted, with explicit confirmation, after refactor extraction and before slicing.
_Avoid_: permanent doc, spec scratchpad

**AFK Loop**:
An unattended single-issue implementation run against an unblocked ready-for-agent issue, ending with fresh verification.
_Avoid_: interactive implementation session

**Auto Loop**:
The continuous orchestration mode that implements, reviews, commits, and closes ready-for-agent issues serially until a stop rule fires. Parent/PRD issues expand into their child queue and are never implemented or closed directly.
_Avoid_: parallel workers, parent auto-close

**Parent Orchestrator**:
The session running the Auto Loop. It resolves the queue and launches fresh child agents for implementation and review; it does not implement directly, and child agents do not run their own subagent workflows.
_Avoid_: worker-orchestrator hybrid

**Completion Evidence**:
The verification artifacts — diff/commits, test results, review findings — required before closeout may close an issue. Missing evidence means relabel and stop, not close.
_Avoid_: claimed done, vibes-based closeout

**Architecture Learning Lens**:
Short deep-module teaching checkpoints (Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality) that exercise the user's own mental model. Used only in human-present phases, never in AFK or Auto Loop workers.
_Avoid_: automatic architecture review, unattended teaching

### Issue Tracker

**PRD Issue**:
A GitHub issue holding a coherent destination/feature proposal, and the parent of the Child Issues sliced from it via its `## Child issues` section.
_Avoid_: epic, container

**Child Issue**:
An independently agentable vertical tracer-bullet slice created from a PRD Issue.
_Avoid_: subtask, horizontal database/API/UI phase

**Milestone**:
An optional human-facing delivery arc that groups PRD Issues and their descendant slices for release orientation. It is not readiness state, and shared milestone membership never implies parent/child hierarchy.
_Avoid_: parent issue, readiness state, skill-routing evidence

**Readiness Label**:
The execution-state label that gates automation: ready-for-agent, needs-info, ready-for-human, wontfix. Labels are the readiness state; milestones and PRDs are not.
_Avoid_: milestone-as-status, implicit readiness

### Skill Routing

**Skill Routing**:
Choosing extra skills for a ticket before launching an implementation or review agent. Routing is hybrid and two-stage: labels provide deterministic first-pass signals, issue/body analysis adds skills when concrete evidence supports them, and the worker may adjust the proposed pack after repo exploration when it finds new evidence. Parent orchestration does not recompute routing mid-run. Worker adjustment may add any available registry skill, including repo-defined skills, but must not invent unregistered skill IDs or browse skill files outside the registry. `/matt-route-skills <issue>` is the read-only dry-run/explain command for tuning routes: it requires a GitHub issue target and always validates repo route config and the active skill registry before reporting packs. Routing is reusable routing logic that commands consume, not behavior embedded in prompt strings.
_Avoid_: skill injection, skill magic, auto-loading

**Skill Routing Module**:
The reusable code module that loads registry/config, validates route health, matches issue evidence, builds agent-specific skill packs, detects overflow, and formats routing explanations. `/matt-route-skills`, `/matt-slice`, `/matt-afk`, and `/matt-auto` consume this shared module. Core routing returns structured data, with separate formatters for dry-run summaries, worker/review prompt contracts, and slice-time issue hints. Child-agent contracts include selected skill IDs, absolute `SKILL.md` paths, and evidence-backed rationale; child agents read selected skill files as mandatory upfront guidance before acting instead of receiving full skill contents inline. Child agents output only a compact `Skill adjustments` note when they change the parent-proposed pack, or `none` when unchanged; skill routing is guidance uplift rather than an audit checklist. Commit messages and closeout comments describe actual changes and verification, not the skills used. `/matt-auto` route results stay in memory and appear only in the compact final loop log or stop reason; auto does not persist routing internals to repo files or issue comments. Skill routing does not affect `/matt-auto` queue ordering; it only changes how selected issues are worked, or stops the loop when routing exposes missing skills or overly broad slices. The router does not infer repository tech-stack prerequisites or route-level `requires`; route authors are responsible for configuring routes that fit their repo. `/matt-route-skills` shows selected packs plus a compact considered/skipped section for partial, low-confidence, disabled, or otherwise relevant routes, not every unmatched route.
_Avoid_: prompt-only router, duplicated command-specific routing logic, brittle prompt-text assertions, inlined full skill dump, audit-style skill policing, skill-name closeout, route-log issue spam, skill-based queue priority, inferred tech-stack gating, monolithic index.ts router, noisy route debugger dump

**Worker Skill Pack**:
The small selected set of allowlisted skills given to the implementation agent session that picks up a ticket. A worker skill pack is explainable and capped so the agent gets targeted guidance instead of broad prompt noise. Most implementation-relevant skills are compatible with review too.
_Avoid_: all relevant skills, full skill dump

**Review Skill Pack**:
The small selected set of allowlisted skills given to the review agent session for a ticket. Most route-selected skills may appear in both worker and review packs, but some skills are review-only when their purpose is auditing rather than implementation, such as security review.
_Avoid_: reviewer prompt dump, one-size-fits-all review lens

**Agent Compatibility**:
The explicit set of agent roles a routed skill may be sent to. Compatibility is modeled as a list of roles such as `worker` and `review`, not as a `both` shortcut, so future agent roles can be added without changing the model.
_Avoid_: both, universal compatibility, hardcoded two-agent assumptions

**Baseline Skill Pack**:
The mandatory default skill pack for Matt workflow automation before ticket-specific routing is applied. The worker baseline includes `implement` and `tdd`; the review baseline includes `code-review`; route-selected skills add specialization on top. Baseline skills appear explicitly in generated worker/review contracts rather than hiding as implicit phase behavior. Repo `disabledSkills` affects routed skills only and does not remove baseline skills.
_Avoid_: empty baseline, phase prompt replacement

**Pack Cap**:
The configurable maximum number of routed, ticket-specific skills included in a skill pack after deduplicating by skill ID, not counting baseline skills. Atomic issue slices normally warrant only three to four routed skills; needing more is evidence that the issue may be too broad or should be split further. Defaults are `workerMaxRoutedSkills: 3` and `reviewMaxRoutedSkills: 4`; repo config may override without hard upper bounds, but configured limits must be positive integers and `0` is not a disable mechanism. If high-confidence routed skills exceed the active cap, auto mode stops before implementation and recommends human re-slicing instead of silently dropping high-confidence skills. Medium-confidence overflow does not stop automation: high-confidence skills are included first, then medium-confidence skills until the cap, and the rest are listed as considered/skipped due to cap. Skill packs sort baseline skills first, then routed skills by confidence, preserving active route order within the same confidence.
_Avoid_: prompt bloat, broad slice, hard limit bounds

**Worker Skill Allowlist**:
The curated set of skills that Matt workflow automation may route into AFK implementation or review sessions. The allowlist protects auto loops from accidentally using broad, interactive, destructive, or account-mutating skills. Extension defaults may be narrowed or extended by repo-local route config.
_Avoid_: installed skills, global skill library

**Repo Skill Route Config**:
A project-owned `.pi/matt-skill-routes.json` file layered on top of the extension's default skill routes. It lets a repo map its own labels, paths, and issue language to allowlisted worker or review skills without changing the Matt workflow extension. Repo skill routes select skill IDs with evidence-backed rationale, not arbitrary prompt snippets or binding policy text, and may define repo-owned skill registry entries. The format is strict JSON with a required `version: 1` so future config migrations can hard-stop clearly on missing or unsupported versions. Repo config is additive: it adds skills and routes, then applies explicit `disabledRoutes` and `disabledSkills`; it does not deep-patch default route objects. Route matching uses only positive `labels`, `title`, `body`, and `paths` fields; `labels` use explicit normalized matching, and `title`/`body` use plain case-insensitive substring tokens, not regex. Confidence is route-level only, defaulting to `medium`, with router-owned promotion rules for strong signals or multiple matches. Invalid repo config is a hard stop only for routing-aware commands (`/matt-route-skills`, `/matt-slice` skill hints, `/matt-afk`, `/matt-auto`); unrelated planning/status commands are not blocked. Routing-aware commands validate route config before fetching GitHub issues or doing target-specific work. `/matt-init-skill-routes` scaffolds only the initial `.pi/matt-skill-routes.json` without overwriting existing config; it includes all top-level sections for discoverability, including explicit default top-level `limits`, and does not create example skill files or directories. There is no per-token confidence and no per-route negative evidence block such as `unless`.
_Avoid_: global config, hardcoded project rules, executable config, deep route override, per-route unless rules, regex route matching, per-token confidence, broad label alias vocabulary, unversioned config

**Evidence Signal**:
A label, issue title/body phrase, acceptance criterion, parent PRD detail, explicit file-path hint, touched-file path, discovered code detail, or slice-time agent skill hint used to justify selecting a skill. Conflicting signals are additive and weighted: child acceptance criteria outrank child labels/body, child file paths outrank inherited parent PRD context, and repo-local defaults are weakest. Route fields use OR matching for initial selection, but confidence depends on signal strength and reinforcement: broad labels alone are usually medium, strong acceptance/body phrases can be high, and multiple medium signals can combine into high. Evidence produces simple `high`, `medium`, or `low` route confidence: high is automatically selected, medium is selected when the Pack Cap allows, and low is considered but skipped unless reinforced. Confidence promotion is generic, not route-specific: route config has no per-route promotion knobs, and the router owns simple promotion rules such as multiple matching evidence fields raising confidence. When multiple routes select the same skill, route results deduplicate by skill ID, keep the highest confidence, and merge all route IDs/evidence for explanation. Milestone titles or descriptions are not routing evidence because milestones are broad delivery arcs, not ticket-specific implementation signals. Slice-time hints are low-authority evidence; auto mode recomputes routing from final child issue state before implementation.
_Avoid_: guess, vibe, heuristic without evidence, milestone-as-skill-signal, route-specific promotion knobs

**Agent Skill Hint**:
Durable skill-routing metadata written to child issues during slicing. Agent skill hints have both a visible Markdown summary for humans and machine-readable metadata for stable automation parsing, but remain low-authority evidence that auto mode recomputes before implementation. Machine-readable hints include resolved skill IDs plus route IDs as diagnostic provenance. `/matt-slice` hard-stops before creating child issues when routing config is invalid, rather than creating issues with missing or misleading skill hints. There is no `--no-skill-hints` bypass; fixing route config is the intended path.
_Avoid_: hidden-only metadata, prose-only metadata, binding route decision, skill-hint bypass

**Missing Routed Skill**:
A skill selected by active route config that is unavailable in the current Pi session. Missing routed skills are hard stop conditions for Matt auto/AFK automation; the loop does not silently skip, fall back, or claim the skill was used.
_Avoid_: graceful fallback, unavailable warning only, hallucinated skill use

**Skill Registry**:
The active catalog of routeable skill IDs, compatibility, safety, and resolver metadata. It starts with extension-owned defaults and may be extended by repo-local config for project-specific skills. Extension defaults are small, high-signal, defined in TypeScript for type-checking, and include known high-value non-Matt workspace skills — accessibility, React performance, testing philosophy, observability, and review-only security review — with strict availability validation still applying. Repos add domain-specific breadth or disable defaults through repo-local JSON config. The registry does not hardcode absolute paths in persisted config; it stores stable IDs plus source/relative-path metadata and computes availability from the current Pi session, extension root, or repo root at runtime. Repo-defined skill resolvers are repo-relative local `SKILL.md` paths only, with `.pi/skills/<id>/SKILL.md` as the recommended convention. No remote URLs or shell-command resolvers.
_Avoid_: extension-only skill catalog, persisted absolute paths, runtime-only opaque lookup, remote skill resolver, broad default route set
