# Matt pipeline operation inventory

**Wayfinder task:** [Inventory repeated operations across the Matt pipeline](https://github.com/GregM1991/gm-pi-environment/issues/38)

**Parent map:** [Wayfinder map: deterministic workflow operations for Pi](https://github.com/GregM1991/gm-pi-environment/issues/35)

**Purpose:** evidence for the later decision ticket [Choose the v1 workflow-operation catalog](https://github.com/GregM1991/gm-pi-environment/issues/39). This inventory does not choose or implement the v1 catalog.

## Scope and method

The inventory covers:

- every command and phase prompt registered in `extensions/matt-workflow-pi-extension/index.ts`;
- local phase policy in `augmentations/`;
- the extension's conventions, skill-routing, and review-ledger support Modules;
- the tracker recipes supplied by the vendored GitHub tracker reference and the operational parts of the vendored phase skills.

The evidence is the current repository state. Prompt text is counted as a current recipe even when no TypeScript Module implements it, because the caller—the phase agent—must presently remember and execute that recipe.

### Determinism classification

- **Pure** — same explicit input and local snapshot produces the same normalized result; no side effect.
- **Bounded** — the Interface can be deterministic about preconditions, attempted side effects, verification, and typed outcomes, but cannot guarantee that a concurrent or remote system applies a mutation exactly once.
- **Split** — a deterministic read/normalization core exists, but policy or judgment must remain with phase orchestration.
- **No** — the work is primarily synthesis, product judgment, HITL authorization, or whole-phase orchestration rather than a semantic operation.

This classification follows the two completed research tickets: Pi can host strict semantic tools, while GitHub mutations need read/verify/reconcile contracts and explicit conflict or unknown-outcome results.

## Evidence matrix

Repetition and risk use **H/M/L** relative to this workflow. “Leverage” asks whether another workflow could reuse the same domain meaning, not merely the same shell command.

| Candidate semantic operation | Phase/command evidence | Current recipe | Side effects | Hidden caller knowledge currently outside an Interface | Repetition / risk / Leverage | Deterministic? |
|---|---|---|---|---|---|---|
| **Load and validate repo conventions** | Every phase through `baseContext`; init command (`index.ts:342-349`, `560-568`); implementation in `conventions/config.ts:27-146` | Find `.pi/matt-conventions.json`, parse strict JSON, reject unknown fields/version/path escapes/missing docs, then merge configured sections with detection hints. | Read-only; scaffold variant creates one file. | Validation ordering, per-section fallback, supported command keys, repo containment, and “invalid config hard-stops phase launch.” | H / H / H | **Pure** for load/validate; **Bounded local** for refuse-to-overwrite scaffold. Already a deep support Module. |
| **Load and validate skill-route configuration** | `/matt-route-skills`, `/matt-tickets`, `/matt-afk`, `/matt-auto` (`index.ts:286-334`, `548-568`, `666-690`, `720-745`); `skill-routing/config.ts:32-327` | Parse strict config, merge defaults, resolve skill paths, validate IDs/roles/safety/caps/availability, and hard-stop invalid routing-aware phases. | Read-only; scaffold variant creates one file. | Default registry composition, resolver provenance, baseline immunity from disabled routes, overflow hard-stop, and path-containment rules. | H / H / H | **Pure** for a filesystem snapshot; scaffold is **Bounded local**. Already a deep support Module. |
| **Route one issue into worker/review skill packs** | `/matt-route-skills`, tickets hints, targeted AFK, auto (`index.ts:245-334`); `skill-routing/router.ts:19-194`; formatters in `skill-routing/format.ts` | Fetch title/body/labels, extract path-like text, normalize evidence, promote confidence, deduplicate skills, apply compatibility/caps, format contracts. | Read-only. | Exact evidence precedence, plain-substring semantics, confidence promotion, cap ordering, missing-skill behavior, and the distinction between baseline and routed skills. | H / H / M-H | **Pure** after issue evidence is supplied. Existing route Module is reusable; the `gh issue view` fetch remains coupled in `index.ts:252`. |
| **Resolve a tracker target and fetch a normalized issue summary** | Base context asks every named issue to be read (`index.ts:347`); intake, tickets, AFK, auto, review, closeout, status, architecture commands; existing narrow fetch at `index.ts:213-283` | Recognize `123`, `#123`, or GitHub issue URL; run `gh issue view`; parse selected JSON fields; normalize labels and explicit paths. | Remote read. | Target grammar, repository inference, issue-vs-PR ambiguity, required field projection, privacy-masked absence, redirects/transfers, and error classification. | H / M-H / H | **Bounded read**. Schema and normalization can be deterministic; remote state and authorization produce typed outcomes. |
| **Fetch a complete issue aggregate** | Intake requires comments; tickets needs full body/comments; closeout requires comments, labels, milestone, criteria, diff/commits; auto needs parent/spec evidence (`index.ts:368`, `373`, `377`, `379`); tracker recipe at `issue-tracker-github.md:8` | Combine issue state/body/labels/assignees/milestone/comments/sub-issue and dependency summaries, with complete pagination where needed. | Remote read. | Which fields constitute “full,” pagination, issue-vs-PR handling, canonical identity, comment ordering, permissions, and partial/incomplete result handling. | H / H / H | **Bounded read**. Strong candidate Seam because many phases currently request inconsistent projections. |
| **List issues with explicit filters and complete pagination** | Triage/status/AFK/auto/milestone/Wayfinder frontier (`index.ts:434-457`, `379`; tracker recipe `issue-tracker-github.md:9,43`; triage skill `triage/SKILL.md:58-64`) | Run `gh issue list` or `gh api`, apply state/label/assignee/milestone filters, paginate, remove PRs where appropriate, normalize, then sort. | Remote read. | Default-open behavior, porcelain limits, PR contamination, stable ordering, pagination completeness, moving-list semantics, and authorization-masked results. | H / H / H | **Bounded read**. Deterministic projection/order, not snapshot isolation. |
| **Compute readiness/frontier from normalized issues** | AFK and auto select open, unblocked, ready-for-agent work; Wayfinder selects open, unblocked, unassigned children (`index.ts:315`, `327`, `375`, `379`; `wayfinder/SKILL.md:67-69,122-126`) | Filter state labels; exclude Wayfinder planning artifacts; resolve blockers; reject conflicting state labels; order oldest or map order; stop on human-required states. | None after inputs are loaded. | Canonical readiness-role mapping, whether blockers are native or textual, open-blocker semantics, Wayfinder exclusion, parent queue boundary, tie-breaking, and conflict stop rules. | H / H / H | **Split**. Pure frontier computation is deterministic; interpreting free-text blockers/acceptance criteria and “requires human” remains policy/judgment. |
| **Discover a parent and enumerate ordered child issues** | Tickets writes a child index; auto expands parent targets; closeout/status/milestone report children (`index.ts:373`, `377`, `379`, `434-457`) | Parse generated `## Child issues`, task-list references, comments/metadata, then query native sub-issues; fall back to linked issues only when relationship is clear. | Remote reads. | Source precedence, generated-section grammar, native ordering, deduplication across sources, milestone-not-hierarchy rule, and ambiguity stop conditions. | H / H / H | **Split**. Native relation and generated-section parsing are deterministic; heuristic parent detection and linked-issue inference are not. |
| **Ensure one readiness/category label role** | Spec publishes ready-for-agent; refactors/tickets create labelled issues; triage and closeout transition state; auto filters and may relabel (`to-spec/SKILL.md:19`; `triage/SKILL.md:32-45,78-90`; `index.ts:372-379`) | Read current labels, map canonical role to repo label, add desired role, remove mutually exclusive roles, verify post-state. | Remote mutation. | Label-role mapping, mutual-exclusion set, whether category and state are both required, authorization, preservation of unrelated labels, and confirmation policy. | H / H / H | **Bounded mutation**. Use typed `applied`/`already-satisfied`/`rejected`/`conflict`/`unknown-outcome`; HITL authorization stays in the phase. |
| **Ensure an assignee / claim a ticket** | Wayfinder claims before work (`wayfinder/SKILL.md:67,123`; tracker recipe `issue-tracker-github.md:44`) | Read assignees, resolve `@me`, add eligible assignee, verify it was not silently ignored. | Remote mutation. | Claim timing (“first write”), login normalization, eligibility, concurrent claims, and whether an existing assignee means claimed by another session. | M / H / H | **Bounded mutation**. High risk reduction despite narrower repetition. |
| **Create a structured issue** | Spec, refactors, tickets, Wayfinder, auto prevention issues (`index.ts:371-373`, `379`; tracker recipe `issue-tracker-github.md:7`) | Render title/body/labels/milestone, call create, capture stable IDs/URL, then verify fields before later relationship writes. | Remote mutation; notifications. | Template ownership, disclaimer rules, label/milestone mapping, idempotency marker, duplicate search, repository identity, and which later relationship writes are part of the operation. | H / H / H | **Bounded mutation**. Generic “create arbitrary issue” is shallow; named variants may be deep enough only where schemas and postconditions are stable. |
| **Attach/detach/reorder a sub-issue** | Tickets and Wayfinder create child relationships; auto/status/closeout read them (`index.ts:370`, `373`, `379`; tracker recipe `issue-tracker-github.md:41`) | Resolve database IDs, read current parent/order, add or remove native sub-issue, optionally position it, verify both parent and ordered children. | Remote mutation. | Global database ID vs issue number, one-parent rule, `replace_parent` safety, owner constraints, expected sibling-order fingerprint, and fallback body convention. | M / H / H | **Bounded mutation**. Native relation path is deterministic about evidence; textual fallback should be a separate Adapter capability. |
| **Ensure a dependency edge** | Tickets and Wayfinder wire blockers in a second pass (`index.ts:370`, `373`; `wayfinder/SKILL.md:69,113-114`; tracker recipe `issue-tracker-github.md:42`) | Resolve blocker database ID, list existing edges, reject self/obvious cycle, add/remove relation, verify both directional views. | Remote mutation. | Database ID vs issue number, create-after-ID sequencing, cycle semantics, same-repo constraints, textual fallback, and reconciliation after timeout. | M-H / H / H | **Bounded mutation**. Strong cross-workflow tracker meaning. |
| **Replace one generated Markdown section while preserving the rest** | Tickets must replace exactly one `## Child issues` section; Wayfinder updates `Decisions so far`, `Not yet specified`, and `Out of scope` (`index.ts:370`, `373`; `wayfinder/SKILL.md:29-52,125-126`) | Read body, parse an owned heading range, compare expected body/hash, replace/append exactly one section, write narrow body update, re-read and verify. | Remote mutation. Pure local transform precedes it. | Heading grammar, ownership marker, duplicate-section behavior, byte-preservation requirement, expected pre-state, newline policy, and conflict behavior. | M-H / H / H | **Split**: local section transform is **Pure**; remote write is **Bounded**. A generic arbitrary-body editor would lose Depth. |
| **Post an idempotent workflow comment** | Triage notes/briefs, Wayfinder resolutions, closeout completion, auto closeout/prevention issues (`triage/SKILL.md:13-18,79-90`; `index.ts:370`, `377`, `379`; tracker recipe `issue-tracker-github.md:10,45`) | Render required disclaimer/template, search for an operation marker, create once, capture comment ID, reconcile after timeout, verify body. | Remote mutation; notifications. | Required disclaimer, template/version, stable operation marker, duplicate definition, comment ordering, and whether an existing equivalent comment may be reused. | H / H / H | **Bounded mutation**. Comment creation itself is non-idempotent without an explicit marker/ledger contract. |
| **Transition issue state with reason and evidence** | Triage may close wontfix; Wayfinder resolves/closes tickets; closeout and auto close completed issues (`triage/SKILL.md:82-86`; `index.ts:370`, `377`, `379`; tracker recipe `issue-tracker-github.md:12,45`) | Read state/reason, no-op if satisfied, patch absolute target state/reason, verify, and return before/after evidence. | Remote mutation. | Allowed reasons, confirmation/HITL authority, evidence sufficiency, parent-not-close rule, milestone independence, and compensation after concurrent change. | H / H / H | **Bounded mutation**. The operation can enforce state mechanics, not decide that evidence authorizes closure. |
| **Query milestone delivery-arc status** | `/matt-status`, `/matt-milestone`, spec/tickets inheritance, closeout, auto filters (`index.ts:434-457`, `371`, `373`, `377`, `379`) | Resolve milestone title/number, list issues and progress, then join discovered spec/child hierarchy without using shared milestone as hierarchy. | Remote read. | Title ambiguity, open/closed selection, progress count interpretation, orphan definition, and parent/child source precedence. | M / M / M | **Split**. Complete milestone/issue retrieval and joins are deterministic; deciding “close to wrap-up” or “next human decision” is not. |
| **Resolve a Git review fixed point and diff evidence** | Review and closeout; auto review packets/commit evidence (`code-review/SKILL.md:19-31`; `index.ts:376-379`) | Validate ref with `git rev-parse`; compute three-dot diff and `<base>..HEAD` commits; reject empty diff; locate issue references. | Local read. | Three-dot merge-base rule, dirty-worktree inclusion, binary/large diff bounds, issue-reference grammar, and what counts as the current implementation boundary. | M-H / H / H | **Bounded local read**. Deterministic for an explicit repo snapshot and fixed point; spec discovery from names/commit prose is **Split**. |
| **Inspect and classify dirty worktree state** | Auto preflight and issue-to-issue loop safety (`index.ts:379`) | Read porcelain status, ignore owned temporary artifacts, distinguish pre-existing changes from current issue/ledger work, stop on unexplained dirt. | Local read. | Ownership provenance, ignored packet/log rules, ledger exception, staged vs unstaged meaning, and whether another session is active. | M / H / H | **Split**. Status parsing is pure; attributing changes to a loop iteration is not reliable without an operation ledger or explicit baseline snapshot. |
| **Prepare/update/clean a secure review packet** | Auto only (`index.ts:379`; `augmentations/auto.md:5-9`) | Canonicalize origin or real path, base64url a repo identity, create `0700` directories and `0600` packet, write a fixed projection, update per cycle, delete on closeout/termination. | Local filesystem mutation outside worktree. | Origin normalization, fallback identity, exact ownership/content schema, symlink/path safety, correction of existing modes, run-owned cleanup set, and all termination paths. | M within one phase / H / H | **Bounded local mutation**. Strong Leverage for other orchestrated review workflows despite one current caller. |
| **Prepare/run/summarize/clean verification evidence** | AFK, review with configured AI gate, closeout, auto (`index.ts:363-365`, `375-379`; `augmentations/auto.md:11-15`) | Resolve repo command, ensure ignored private log directory, run once with stdout/stderr redirected, return compact pass/fail/failing-cases/path, track whether later changes invalidate it, clean run-owned logs. | Runs arbitrary repo checks; local files/processes. | Command source, cwd/env, timeout/cancellation, stage naming, permission/symlink safety, what inputs invalidate evidence, full-output bounds, failing-case extraction, and run ownership. | H / H / H | **Split**. Artifact lifecycle and execution envelope are bounded; command semantics and “evidence still covers exact inputs” need explicit fingerprints/policy. Whole arbitrary command execution must not become a generic workflow tool. |
| **Validate/parse review-ledger JSONL** | Auto append preflight and retro validation (`index.ts:378-379`; `augmentations/retro.md:5-13`); implementation `review-ledger/schema.ts:81-159` | Parse every nonblank line, validate closed fields/shapes, default legacy missing source to review-child in memory, report every malformed line number, never rewrite. | Read-only. | Legacy compatibility, exact timestamp/location grammar, all-or-nothing analysis gate, and verdict-only vs finding record distinction. | M-H / H / H | **Pure**. Existing deep support Module; currently retro prompt repeats rules already implemented in TypeScript. |
| **Normalize/map/deduplicate review-surface findings** | Auto AI gate and retro (`index.ts:365`, `378-379`; `augmentations/auto.md:72-100`); implementation `review-ledger/schema.ts:163-214` | Map gate outcome to PASS/FIX/BLOCKER; normalize locations/text; suppress same-issue gate duplicates; build failure records. | None until append. | Source precedence, file:line fallback, same-issue comparison scope, non-empty evidence rule, and closed category mapping. | M / H / H | **Pure** for current mappings/deduplication. “Substantially same recurring class” across issues remains human/LLM judgment and must not be misrepresented as deterministic. |
| **Append one validated review-ledger record** | Auto after every review/gate (`index.ts:379`; `augmentations/auto.md:17-70`) | Validate new record, create `.pi/` if needed, append exactly one JSON object plus newline, preserve old bytes, then verify tail. | Local tracked-file mutation. | Append-only guarantee, file locking/serialization, newline rules, legacy preservation, issue-commit ownership, and whether append is expected dirt. | H within auto / H / M-H | **Bounded local mutation**. Deterministic with a mutation queue and expected file fingerprint; concurrent writers otherwise risk lost/interleaved writes. |
| **Derive recurring-class key and prevention-issue dedupe key** | Auto recurring prevention (`index.ts:365`, `379`; `augmentations/auto.md:72-74`) | For a genuinely new class, normalize category and summary (NFKC, case, whitespace, digit runs, punctuation) and join them; reuse existing class key after judgment says two findings match. | None; later used in prompts/issues. | The initial semantic class-equivalence judgment, canonical-key lifetime, punctuation definition, and search scope. | M / H / M-H | **Split**. Key derivation is pure; deciding that two differently worded findings are the same class is not. |
| **Create/search a prevention issue by canonical key** | Auto recurring prevention (`index.ts:379`) | Search open issues for the verbatim key; reuse exactly one or create a human-triage issue with cited ledger evidence and prevention tiers. | Remote read/mutation. | Search completeness, canonical marker placement, duplicate/race handling, title/body template, and no automatic policy application. | M / M-H / H | **Bounded mutation** once the class/key is supplied. |
| **Maintain `MATT-GRILL-NOTES.md` owned sections** | Grill, spec, refactors, tickets (`index.ts:369,371-373`; `augmentations/grill.md:5-41`) | Lazily create; append numbered Q&A without rewriting; replace/group the editable refactor section; detect pre-ticket gate; delete only after explicit confirmation. | Local tracked/untracked file mutation and deletion. | Section ownership, next question number, supersession rule, scope classification, deletion authorization, and proof that extraction is complete. | M / M-H / L-M | **Split**. Append/section transforms and existence gate are bounded; deciding scope/grouping and authorizing deletion are HITL. |
| **Scaffold a strict config without overwrite** | `/matt-init-skill-routes`, `/matt-init-conventions` (`index.ts:560-576`; `conventions/config.ts:104-118`; `skill-routing/config.ts:32-62`) | Compute canonical path, refuse if present, create parent directory, write versioned JSON plus final newline. | Local file creation. | Canonical location, defaults, mode/symlink handling, and “never overwrite.” | L-M / M / H | **Bounded local mutation** and already implemented. |
| **Load durable repo context references** | Every phase (`index.ts:342-349`), plus status/review/auto packet | Find applicable `AGENTS.md`, `CONTEXT.md`, ADRs, configured docs, and issue references; read relevant subset before acting. | Local/remote reads. | Directory inheritance, relevance, doc precedence, configured extra docs, size bounds, and when issue comments are mandatory. | H / M / H | **Split**. File discovery/precedence can be deterministic; relevance selection and summarization remain agent work. |
| **Launch and settle a fresh Pi phase/session** | AFK and review use `waitForIdle` + `newSession`; auto launches worker/reviewer children (`index.ts:694-703`, `753-757`, `790-799`) | Wait for idle, fork a session with parent pointer, send prompt, then interpret later completion/settlement and child evidence. | Starts agent work and may indirectly cause arbitrary effects. | Headless mode, parent/session identity, settlement semantics, cancellation, model/agent selection, usage caps, and child contract. | M / H / H | **No for this map**. This is whole-phase orchestration and belongs to adjacent [Headless Matt phase invocation Interface](https://github.com/GregM1991/gm-pi-environment/issues/34). |
| **Stage and create one issue-scoped commit** | Auto (`index.ts:379`) | Verify exact issue changes, stage selected files including ledger append, run/freshen verification if needed, write conventional message referencing issue, capture commit ID. | Local Git mutation. | Change ownership, partial staging, one-issue boundary, allowed generated files, hooks, verification fingerprint, message format, and concurrent worktree safety. | M / H / M-H | **Split**. Git mechanics can be bounded, but choosing which dirty changes belong to the issue is unsafe without explicit writer provenance. |
| **Spec synthesis, ticket decomposition, review judgment, grilling, architecture coaching, retro clustering/proposals** | `/matt-grill`, `/matt-wayfinder` HITL tickets, `/matt-spec`, `/matt-tickets`, `/matt-review`, `/matt-retro`, architecture lens/gym (`index.ts:369-378`, `462-506`) | Read evidence, reason, ask user, synthesize prose/decisions, or judge correctness and architecture. | May create later artifacts only after phase authorization. | Product intent, quality judgment, scope, explanatory language, and human decisions. | Repeated / variable risk / low semantic reuse as deterministic ops | **No**. Keep as phase orchestration or ordinary LLM work; only their bounded reads/writes should cross the Seam. |
| **Help/profile/skills display and `/matt-next` phase choice** | `index.ts:382-431`, `521-546`, `761-802` | Format static command/skill information or ask the user to choose a phase, then send the corresponding prompt. | Session/UI entry; no destination mutation. | Current UI availability and human intent. | L / L / L | **No catalog need**. Existing extension code is sufficient. |

## Phase and command coverage audit

This cross-check ensures that low-activity commands were not hidden by the candidate-oriented matrix.

| Command/phase | Operation rows that cover its recipes | Non-operation work intentionally left with the phase |
|---|---|---|
| `/matt-start` | Target resolution, complete issue aggregate, durable context | Recommend next phase and HITL/AFK suitability |
| `/matt-grill` | Issue/context reads, `MATT-GRILL-NOTES.md` maintenance | Interviewing, scope judgment, domain decisions |
| `/matt-wayfinder` | Complete issue aggregate, frontier, claim, create issue, sub-issue/dependency edges, comments, state transition, owned-section update | Breadth-first charting and HITL decision resolution |
| `/matt-spec` | Context reads, structured issue creation, readiness label, milestone read/write mechanics | Synthesis and test-Seam confirmation |
| `/matt-refactors` | Context/note reads, structured issue creation, labels, confirmed note deletion | Candidate grouping and approval |
| `/matt-tickets` | Note gate, issue creation, sub-issues, dependencies, labels, generated-section update, route packs | Tracer-bullet boundaries, expand-contract judgment, publication approval |
| `/matt-afk <target>` | Target fetch, readiness/frontier, routing, verification envelope | Implementation and test design |
| no-arg `/matt-afk`, `/matt-auto` | Queue/frontier, parent/children, routing, packets, logs, ledger, Git evidence/commit mechanics, comments, close/state, prevention-issue dedupe | Serial orchestration, worker/reviewer judgment, ownership decisions |
| `/matt-review` | Issue aggregate, fixed-point/diff evidence, verification/AI-gate envelope, finding normalization | Standards/spec judgment and remediation advice |
| `/matt-closeout` | Complete issue aggregate, parent/children, milestone read, comment, label/state transition, Git/verification evidence | Deciding whether evidence satisfies acceptance criteria and obtaining confirmation |
| `/matt-retro` | Ledger parse/validation and deterministic aggregations | Semantic clustering, why-missed themes, proposal choice, per-proposal HITL approval |
| `/matt-status` | Issue/milestone/child/frontier reads, Git status, context discovery | Progress narrative and next-step recommendation |
| `/matt-milestone` | Milestone and joined issue/child reads | Delivery-arc interpretation and next human decision |
| `/matt-route-skills` | Config validation, issue summary fetch, pure routing/formatting | None beyond presentation |
| `/matt-init-*` | Refuse-to-overwrite config scaffolds | None |
| `/matt-arch-lens`, `/matt-arch-gym` | Optional issue/context reads | Teaching and user-first coaching |
| `/matt-help`, `/matt-profile`, `/matt-skills`, `/matt-next` | Existing static formatting/session dispatch | Human phase choice |

## Repetition clusters

### 1. Tracker read cluster

The same conceptual read is independently restated across intake, routing, tickets, Wayfinder, status, milestone, AFK, auto, review, and closeout. The projections differ—routing currently fetches only title/body/labels, while closeout needs comments, milestone, children, acceptance criteria, and evidence—but they share identity normalization, pagination, error classification, and completeness rules.

**Deletion test:** if `gh issue view/list/api` recipes disappeared from phase prompts, a tracker-neutral Interface would still need to expose issue identity, normalized state/labels/assignees, comments, milestone, ordered children, dependencies, completeness, and source evidence. That is a real Seam with high cross-workflow Leverage.

### 2. Tracker mutation cluster

Issue creation, label/assignee ensure operations, relationship edges, comments, narrow body-section changes, and state transitions recur across planning, triage, decomposition, closeout, and auto. Each currently relies on the caller to remember read-before-write, the correct GitHub database identifier, preservation rules, postcondition verification, and which mutations require live authorization.

**Deletion test:** a useful Interface removes those mechanics while leaving “should we mutate?” with phase orchestration. A generic `issue edit` or arbitrary action tool would merely expose the Adapter and leak caller knowledge, producing a shallow Module.

### 3. Local evidence-artifact cluster

Review packets, verification logs, the review ledger, grill notes, and generated body sections all repeat ownership, append/replace discipline, file modes, expected-pre-state checks, and cleanup. Some are Matt-specific artifacts, but the secure temporary-packet and bounded verification-evidence mechanics have broader orchestration Leverage.

### 4. Existing deterministic cores

Three deep support Modules already demonstrate the intended direction:

1. conventions config parsing/validation;
2. skill-route config plus pure routing;
3. review-ledger validation, verdict mapping, and same-issue duplicate suppression.

The main gap is not lack of logic everywhere; it is that remote tracker operations and local orchestration artifacts still live as prose-held recipes around those cores.

## Caller-held invariants with the highest current risk

1. **Never confuse issue number, REST database ID, and GraphQL node ID** when wiring GitHub relationships.
2. **Never treat a successful HTTP/CLI exit as a verified semantic mutation**, especially for assignees and ambiguous network outcomes.
3. **Never replace full label/assignee/body state when a narrow ensure/owned-section operation is intended.**
4. **Never infer parent/child hierarchy from shared milestone membership.**
5. **Never include Wayfinder planning artifacts in implementation queues.**
6. **Never close from state alone; closure requires phase-owned evidence and authorization.**
7. **Never lose append-only ledger or note history through read-modify-write races.**
8. **Never treat dirty-worktree attribution or recurring-finding equivalence as deterministic without explicit provenance.**
9. **Never expose generic command execution merely to reuse the verification envelope.**
10. **Never make TUI confirmation a tool invariant; headless-safe operation results and phase-owned HITL policy are required.**

## Architecture learning lens

- **Module:** the prospective Matt Workflow Operations Module owns bounded workflow mechanics and their operation-level invariants.
- **Interface:** semantic reads/mutations with explicit inputs, typed outcomes, completeness/conflict/unknown-outcome states, and side-effect evidence.
- **Implementation:** GitHub REST/`gh api`, filesystem, and Git mechanics hidden behind Adapters.
- **Depth:** highest where one operation hides identifier translation, pagination, preservation, reconciliation, and verification—not where it merely renames a command.
- **Seam:** tracker reads/mutations and evidence-artifact lifecycles are real because many callers already duplicate them; whole-phase execution and speculative backends are not Seams for this map.
- **Adapter:** GitHub is the only v1 tracker Adapter in scope; textual fallbacks are capabilities, not permission to leak GitHub details into the domain Interface.
- **Leverage:** strongest for normalized issue aggregates, complete list/frontier inputs, narrow tracker mutations, secure temporary artifacts, and verification evidence envelopes.
- **Locality:** readiness/authorization policy stays near phases; operation mechanics and invariants move together into the Module.

## Boundaries for the catalog decision

This inventory intentionally does **not** conclude that every candidate belongs in v1. The catalog ticket should apply its stated criteria—repetition, risk reduction, cross-workflow Leverage, schema clarity, and migration cost—and may classify rows as:

- reusable workflow operation;
- Matt-specific helper;
- existing support Module that needs no new Pi tool;
- ordinary LLM/HITL phase work;
- deferred fog.

Dynamic tool activation cannot be judged from row count alone. The catalog and concrete schemas must be chosen first; only then can the prototype ticket measure whether static registration is too large.

## Evidence sources

- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/0002-repo-conventions-config.md`
- `extensions/matt-workflow-pi-extension/README.md`
- `extensions/matt-workflow-pi-extension/index.ts`
- `extensions/matt-workflow-pi-extension/augmentations/*.md`
- `extensions/matt-workflow-pi-extension/conventions/*.ts`
- `extensions/matt-workflow-pi-extension/skill-routing/*.ts`
- `extensions/matt-workflow-pi-extension/review-ledger/schema.ts`
- `extensions/matt-workflow-pi-extension/vendor/mattpocock-skills/engineering/setup-matt-pocock-skills/issue-tracker-github.md`
- Operational sections of the phase skills referenced by `PHASE_SKILLS`, especially `triage`, `wayfinder`, `to-spec`, `to-tickets`, and `code-review`
- [Official Pi runtime constraints for workflow tools](https://github.com/GregM1991/gm-pi-environment/issues/36) and `docs/investigations/pi-workflow-tool-runtime-contract.md`
- [GitHub API guarantees for deterministic tracker operations](https://github.com/GregM1991/gm-pi-environment/issues/37) and `docs/investigations/github-deterministic-tracker-operations.md`
