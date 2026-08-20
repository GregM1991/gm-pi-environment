import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConventionsContext, formatConventionsDiagnostics, scaffoldConventions } from "./conventions/config";
import { formatConventionsHints } from "./conventions/hints";
import type { ConventionsContext } from "./conventions/types";
import { buildRoutingContext, formatValidationDiagnostics, scaffoldSkillRoutes } from "./skill-routing/config";
import { formatDryRun, formatRoutingPromptContract, formatTicketSkillHintInstructions } from "./skill-routing/format";
import { routeIssue } from "./skill-routing/router";
import type { IssueEvidence, RouteResult, RoutingContext, ValidationResult } from "./skill-routing/types";

type Phase = "intake" | "grill" | "wayfinder" | "spec" | "refactors" | "tickets" | "afk" | "review" | "closeout" | "auto" | "retro";
type PhaseWithStatus = Phase | "status";

type SkillRef = {
	name: string;
	relativePath: string;
	useWhen: string;
};

type AugmentationRef = {
	name: string;
	relativePath: string;
	useWhen: string;
};

const EXTENSION_NAME = "matt-workflow";
const PHASES: Phase[] = ["intake", "grill", "wayfinder", "spec", "refactors", "tickets", "afk", "review", "closeout", "auto", "retro"];
const EXTENSION_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MATT_VENDOR_ROOT = path.join(EXTENSION_ROOT, "vendor", "mattpocock-skills");
const AUGMENTATIONS_ROOT = path.join(EXTENSION_ROOT, "augmentations");
const MILESTONE_REFERENCE = path.join(EXTENSION_ROOT, "docs", "agents", "milestones.md");
const AUTO_ARTIFACTS_REFERENCE = path.join(EXTENSION_ROOT, "docs", "agents", "auto-artifacts.md");
const AUTO_CHILD_CONTRACTS_REFERENCE = path.join(EXTENSION_ROOT, "docs", "agents", "auto-child-contracts.md");
const AUTO_REVIEW_LEDGER_REFERENCE = path.join(EXTENSION_ROOT, "docs", "agents", "auto-review-ledger.md");
const PROMOTED_MATT_VENDOR_CATEGORIES = ["engineering", "productivity"] as const;

const skill = (name: string, relativePath: string, useWhen: string): SkillRef => ({
	name,
	relativePath,
	useWhen,
});

const augmentation = (name: string, relativePath: string, useWhen: string): AugmentationRef => ({
	name,
	relativePath,
	useWhen,
});

// Deliberately small phase packs selected from synced, non-deprecated upstream categories.
const PHASE_SKILLS: Record<PhaseWithStatus, SkillRef[]> = {
	intake: [
		skill("ask-matt", "engineering/ask-matt/SKILL.md", "choosing which Matt skill or workflow phase fits the situation"),
		skill("triage", "engineering/triage/SKILL.md", "creating, triaging, or preparing issue-tracker work"),
		skill("setup-matt-pocock-skills", "engineering/setup-matt-pocock-skills/SKILL.md", "setting up Matt Pocock skill repo conventions in a repo"),
	],
	grill: [
		skill("grill-with-docs", "engineering/grill-with-docs/SKILL.md", "codebase work that should challenge plans against CONTEXT.md and ADRs"),
		skill("grilling", "productivity/grilling/SKILL.md", "the breadth-first questioning primitive required by the grill-with-docs wrapper"),
		skill("domain-modeling", "engineering/domain-modeling/SKILL.md", "pinning down domain terminology or a ubiquitous language during alignment"),
		skill("research", "engineering/research/SKILL.md", "delegating primary-source docs/API research to a background agent while grilling continues"),
		skill("prototype", "engineering/prototype/SKILL.md", "a throwaway prototype would flush out a design before committing"),
		skill("codebase-design", "engineering/codebase-design/SKILL.md", "using deep-module vocabulary while shaping architecture-sensitive plans"),
		skill("improve-codebase-architecture", "engineering/improve-codebase-architecture/SKILL.md", "architecture/deep-module opportunities discovered while shaping a plan"),
	],
	wayfinder: [
		skill("wayfinder", "engineering/wayfinder/SKILL.md", "mapping decisions for large, foggy, multi-session work before specification"),
		skill("domain-modeling", "engineering/domain-modeling/SKILL.md", "establishing destination language and decision boundaries"),
		skill("research", "engineering/research/SKILL.md", "resolving research decision tickets through primary-source subagents"),
		skill("prototype", "engineering/prototype/SKILL.md", "live-user prototype decision tickets that reduce implementation fog"),
		skill("grilling", "productivity/grilling/SKILL.md", "breadth-first destination grilling and human decision tickets"),
	],
	spec: [
		skill("to-spec", "engineering/to-spec/SKILL.md", "turning resolved conversation context into a tracker specification"),
		skill("domain-modeling", "engineering/domain-modeling/SKILL.md", "recording canonical domain terms and decisions in the specification"),
		skill("codebase-design", "engineering/codebase-design/SKILL.md", "identifying decision-rich module boundaries and proposed test seams"),
	],
	refactors: [
		skill("triage", "engineering/triage/SKILL.md", "creating follow-up refactor issues and applying tracker labels"),
		skill("improve-codebase-architecture", "engineering/improve-codebase-architecture/SKILL.md", "classifying out-of-scope architecture/refactor candidates before issue extraction"),
	],
	tickets: [
		skill("to-tickets", "engineering/to-tickets/SKILL.md", "turning an approved spec into tracer-bullet tickets with explicit blocking edges"),
		skill("codebase-design", "engineering/codebase-design/SKILL.md", "checking vertical seams and expand-contract boundaries"),
		skill("triage", "engineering/triage/SKILL.md", "applying local tracker readiness policy without re-triaging generated tickets"),
	],
	afk: [
		skill("implement", "engineering/implement/SKILL.md", "implementing a piece of work based on a spec or issue"),
		skill("tdd", "engineering/tdd/SKILL.md", "test-first implementation with red-green-refactor"),
		skill("diagnosing-bugs", "engineering/diagnosing-bugs/SKILL.md", "hard bugs or performance regressions needing disciplined diagnosis"),
		skill("resolving-merge-conflicts", "engineering/resolving-merge-conflicts/SKILL.md", "an in-progress merge or rebase conflict blocks implementation"),
	],
	review: [
		skill("code-review", "engineering/code-review/SKILL.md", "two-axis Standards/Spec review of the diff against a fixed point"),
		skill("codebase-design", "engineering/codebase-design/SKILL.md", "review needs deep-module vocabulary or interface-quality assessment"),
		skill("diagnosing-bugs", "engineering/diagnosing-bugs/SKILL.md", "review finds a hard bug requiring disciplined reproduction"),
	],
	closeout: [
		skill("triage", "engineering/triage/SKILL.md", "checking issue labels/state before closing or relabeling"),
	],
	auto: [
		skill("triage", "engineering/triage/SKILL.md", "finding and ordering ready-for-agent issues and detecting blocker labels"),
		skill("implement", "engineering/implement/SKILL.md", "implementation worker contracts for issue-based work"),
		skill("tdd", "engineering/tdd/SKILL.md", "implementation worker contracts should prefer test-first slices"),
		skill("code-review", "engineering/code-review/SKILL.md", "review child contracts: two-axis Standards/Spec review of each issue's diff"),
		skill("diagnosing-bugs", "engineering/diagnosing-bugs/SKILL.md", "worker or review loops hit hard bugs or regressions"),
		skill("codebase-design", "engineering/codebase-design/SKILL.md", "review detects interface or deep-module design issues that should stop auto mode"),
	],
	retro: [],
	status: [
		skill("ask-matt", "engineering/ask-matt/SKILL.md", "checking which workflow phase should happen next"),
		skill("triage", "engineering/triage/SKILL.md", "checking issue state and labels"),
	],
};

// Most phase policy now lives directly in the phase prompts (objective/constraints/done-when).
// Augmentation files remain only where they add document formats or reporting policy.
const PHASE_AUGMENTATIONS: Record<PhaseWithStatus, AugmentationRef[]> = {
	intake: [],
	grill: [augmentation("grill", "grill.md", "local Q&A and refactor-candidate templates for the MATT-GRILL-NOTES.md scratch document")],
	wayfinder: [],
	spec: [],
	refactors: [],
	tickets: [],
	afk: [],
	review: [],
	closeout: [],
	auto: [],
	retro: [
		augmentation("retro", "retro.md", "ledger validation, clustering, evidence citation, and approval-driven proposal format"),
	],
	status: [augmentation("status", "status.md", "local workflow and milestone status reporting policy")],
};

function workflowSkillPath(): string {
	return path.join(EXTENSION_ROOT, "skills");
}

function skillPath(ref: SkillRef): string {
	return path.join(MATT_VENDOR_ROOT, ref.relativePath);
}

function augmentationPath(ref: AugmentationRef): string {
	return path.join(AUGMENTATIONS_ROOT, ref.relativePath);
}

function availableSkills(phase: PhaseWithStatus): Array<SkillRef & { absolutePath: string }> {
	return PHASE_SKILLS[phase]
		.map((ref) => ({ ...ref, absolutePath: skillPath(ref) }))
		.filter((ref) => existsSync(ref.absolutePath));
}

function availableAugmentations(phase: PhaseWithStatus): Array<AugmentationRef & { absolutePath: string }> {
	return PHASE_AUGMENTATIONS[phase]
		.map((ref) => ({ ...ref, absolutePath: augmentationPath(ref) }))
		.filter((ref) => existsSync(ref.absolutePath));
}

function skillInstructions(phase: PhaseWithStatus): string {
	const refs = availableSkills(phase);
	if (PHASE_SKILLS[phase].length === 0) {
		return "Phase skills: none assigned for this phase; use the phase prompt and local augmentations only.";
	}
	if (refs.length === 0) {
		return "Phase skills: no Matt Pocock upstream skill files found on disk. Stop and report the missing vendored skills.";
	}

	return [
		"Phase skills are loaded into Pi from the vendored mattpocock/skills folders and are also listed here with absolute paths for this phase.",
		"Use only the listed phase skills that actually apply to this target. If a listed skill does not fit the task, skip it and briefly say why.",
		"Use only skills listed in this phase prompt or assigned to you via a skill pack (baseline plus routed skills); do not pull in other skills as workflow guidance on your own. Using Pi extension tools such as subagent orchestration is allowed when the phase prompt explicitly asks for orchestration.",
		"Relevant phase upstream skill files:",
		...refs.map((ref) => `- ${ref.name}: ${ref.absolutePath} — ${ref.useWhen}`),
	].join("\n");
}

function augmentationInstructions(phase: PhaseWithStatus): string {
	if (PHASE_AUGMENTATIONS[phase].length === 0) return "";
	const refs = availableAugmentations(phase);
	if (refs.length === 0) {
		return "Phase augmentations: no local matt-workflow augmentation files found for this phase.";
	}

	return [
		"Phase augmentations are local matt-workflow policy layered on top of the vendored upstream Matt skills.",
		"Use upstream Matt skills as the base workflow. Apply these phase-scoped augmentation files as local policy; when an augmentation conflicts with an upstream skill, the local augmentation wins.",
		"Relevant local augmentation files:",
		...refs.map((ref) => `- ${ref.name}: ${ref.absolutePath} — ${ref.useWhen}`),
	].join("\n");
}

function architectureLensInstructions(): string {
	return [
		"Architecture learning lens: when the target is architecture-sensitive, help the user rehearse the deep-module mental model without turning every phase into a full architecture review.",
		"Use these exact architecture terms when teaching or asking checkpoints: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality.",
		"Prefer short checkpoints over unsolicited refactors: ask what Module/domain concept is being touched, what hidden caller knowledge belongs in the Interface, what the deletion test says, whether a Seam is real or hypothetical, and how tests would improve if the Interface became the test surface.",
		"If the user wants practice, make them answer first, then coach their model with examples from the current issue/repo context. Do not propose new interfaces unless the active phase explicitly calls for design exploration.",
	].join("\n");
}

function routeConfigContext(cwd: string): RoutingContext {
	return buildRoutingContext(cwd, EXTENSION_ROOT);
}

function combinedConfigFailure(conventionsContext: ConventionsContext, routingValidation?: ValidationResult): string | undefined {
	const messages: string[] = [];
	if (conventionsContext.configExists && !conventionsContext.validation.ok) messages.push(formatConventionsDiagnostics(conventionsContext.validation));
	if (routingValidation && !routingValidation.ok) messages.push(formatValidationDiagnostics(routingValidation));
	return messages.length ? messages.join("\n\n") : undefined;
}

function isGithubIssueTarget(target: string): boolean {
	return /^#?\d+$/.test(target.trim()) || /^https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/issues\/\d+\b/.test(target.trim());
}

function normalizeGithubIssueTarget(target: string): string {
	const trimmed = target.trim();
	return /^#\d+$/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

export function isWayfinderPlanningIssue(issue: Pick<IssueEvidence, "labels">): boolean {
	return issue.labels.some((label) => label.trim().toLowerCase().startsWith("wayfinder:"));
}

function wayfinderRedirectMessage(): string {
	return "Wayfinder maps and decision tickets are planning artifacts, not implementation work. Use /matt-wayfinder <map-or-ticket>.";
}

function extractExplicitIssuePaths(...texts: string[]): string[] {
	const paths = new Set<string>();
	const pathLike = /(?:^|[\s([{`"'=])((?:\.{1,2}\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|yml|yaml|toml|rs|go|py|rb|java|kt|swift|php|cs|cpp|c|h|sql|graphql|sh|bash|zsh|fish))(?=$|[\s)\]},.;:'"`])/g;
	for (const text of texts) {
		for (const match of text.matchAll(pathLike)) {
			const candidate = match[1];
			if (!candidate || candidate.includes("://") || candidate.length > 200) continue;
			paths.add(candidate.replace(/^\.\//, ""));
			if (paths.size >= 50) return [...paths];
		}
	}
	return [...paths];
}

type FetchIssueResult = { ok: true; issue: IssueEvidence } | { ok: false; message: string };

function fetchGithubIssue(target: string, cwd: string): FetchIssueResult {
	const normalizedTarget = normalizeGithubIssueTarget(target);
	if (!isGithubIssueTarget(normalizedTarget)) {
		return { ok: false, message: "Expected a GitHub issue number, #number, or issue URL." };
	}
	const result = spawnSync("gh", ["issue", "view", normalizedTarget, "--json", "number,url,title,body,labels"], {
		cwd,
		encoding: "utf8",
	});
	if (result.status !== 0) {
		const stderr = result.stderr?.trim();
		return { ok: false, message: stderr || `gh issue view failed for ${target}.` };
	}
	try {
		const parsed = JSON.parse(result.stdout) as {
			number?: number;
			url?: string;
			title?: string;
			body?: string;
			labels?: Array<{ name?: string } | string>;
		};
		const title = parsed.title ?? "";
		const body = parsed.body ?? "";
		return {
			ok: true,
			issue: {
				number: parsed.number,
				url: parsed.url,
				title,
				body,
				labels: (parsed.labels ?? []).map((label) => (typeof label === "string" ? label : label.name ?? "")).filter((label) => label.length > 0),
				paths: extractExplicitIssuePaths(title, body),
			},
		};
	} catch (error) {
		return { ok: false, message: `Failed to parse gh issue JSON: ${error instanceof Error ? error.message : String(error)}` };
	}
}

function routeGithubIssueTarget(target: string, cwd: string): { ok: true; result: RouteResult } | { ok: false; message: string; fetched?: false } {
	const routingContext = routeConfigContext(cwd);
	if (!routingContext.validation.ok) {
		return { ok: false, fetched: false, message: formatValidationDiagnostics(routingContext.validation) };
	}
	const issue = fetchGithubIssue(target, cwd);
	if (!issue.ok) return { ok: false, message: issue.message };
	return { ok: true, result: routeIssue(routingContext, issue.issue) };
}

// Queue-targeted `/matt-auto` and `/matt-afk <label>` select the concrete issue inside
// the prompt-driven loop, so v1 documents and prompts the required per-issue routing
// hard stop there instead of claiming the extension can pre-route unresolved queues.
function routingAwarePromptAddition(phase: Phase, args: string, cwd: string): string | undefined {
	if (phase === "tickets") {
		const routingContext = routeConfigContext(cwd);
		return formatTicketSkillHintInstructions(routingContext.validation);
	}
	if (phase === "afk" && isGithubIssueTarget(args.trim())) {
		const routed = routeGithubIssueTarget(args.trim(), cwd);
		if (routed.ok) return formatRoutingPromptContract(routed.result);
		return undefined;
	}
	if (phase === "afk") {
		return [
			"Issue-aware skill routing contract:",
			"- Route config was validated before this AFK prompt was sent.",
			"- This prompt-driven label/filter flow discovers the concrete issue after command launch; the extension cannot precompute a pack until a specific GitHub issue is selected.",
			"- Before implementation, exclude every issue labeled `wayfinder:map` or `wayfinder:*`; if selected, stop and redirect to `/matt-wayfinder`. Re-check after every queue refresh. Never treat Wayfinder AFK classification as implementation readiness.",
			"- Before implementation, select exactly one open ready-for-agent issue, fetch it with `gh issue view <number> --json number,url,title,body,labels`, include explicit file-like title/body paths as path evidence, then run the same route computation used by `/matt-route-skills`.",
			"- Stop before implementation on invalid routing config, missing routed skills, or high-confidence routed-skill overflow. Medium-confidence overflow may be trimmed to the cap.",
			"- Worker/review child contracts must include selected skill IDs, absolute SKILL.md paths, evidence-backed rationale, and mandatory upfront guidance to read selected skill files before acting.",
			"- Implementation/fix children must not run review, commit, close issues, or launch subagents. They return the diff and verification evidence to the parent orchestrator, which exclusively owns review launches, remediation decisions, commits, and closeout; this overrides upstream implement's final review/commit steps.",
			"- Ask workers for only a compact `Skill adjustments` line (`none` when unchanged); do not add audit ceremony and do not name skills in commits or closeout comments.",
		].join("\n");
	}
	if (phase === "auto") {
		return [
			"Issue-aware skill routing contract:",
			"- Route config was validated before this auto loop prompt was sent.",
			"- This prompt-driven queue flow discovers the next concrete issue after command launch; the extension does not change queue ordering and cannot precompute every per-issue pack before the queue is resolved.",
			"- Exclude every issue labeled `wayfinder:map` or `wayfinder:*` before launch and after every queue refresh. If one is selected or is the only frontier item, stop and redirect to `/matt-wayfinder`; Wayfinder AFK classification never implies implementation readiness.",
			"- For each selected child/work issue, fetch the issue with `gh issue view <number> --json number,url,title,body,labels`, include explicit file-like title/body paths as path evidence, and route that selected issue before launching worker or review agents.",
			"- If routing validation fails for the selected issue, a selected routed skill is missing, or high-confidence routed skills exceed the active cap, do not launch implementation/review; report the routing stop reason in the compact final loop log. Medium-confidence overflow may be trimmed to the cap.",
			"- Worker/review child contracts must include selected skill IDs, absolute SKILL.md paths, evidence-backed rationale, and mandatory upfront guidance to read selected skill files before acting.",
			"- Implementation/fix children must not run review, commit, close issues, or launch subagents. They return the diff and verification evidence to the parent orchestrator, which exclusively owns review launches, remediation decisions, commits, and closeout; this overrides upstream implement's final review/commit steps.",
			"- Ask workers for only a compact `Skill adjustments` line (`none` when unchanged); do not add audit ceremony and do not name skills in commits or closeout comments.",
		].join("\n");
	}
	return undefined;
}

// The architecture learning lens rehearses the *user's* mental model in selected
// interactive workflow phases. Retro stays HITL through its own per-proposal approval contract.
const HUMAN_PRESENT_PHASES: PhaseWithStatus[] = ["intake", "grill", "wayfinder", "spec", "refactors", "tickets", "review", "closeout", "status"];

function baseContext(cwd: string, phase: PhaseWithStatus, conventionsContext = buildConventionsContext(cwd)): string {
	const lines = [
		"You are orchestrating Matt Pocock's AI feature workflow inside pi.",
		"Keep this phase narrow. Do not jump ahead to later phases.",
		"Use repo guidance and durable artifacts instead of relying on long conversation context.",
		"Read relevant context before acting: `AGENTS.md`, `CONTEXT.md`, relevant `docs/adr/*`, relevant directory-level `AGENTS.md`, and any named GitHub issue via `gh issue view <number> --comments`.",
		...formatConventionsHints(conventionsContext, cwd),
		skillInstructions(phase),
		augmentationInstructions(phase),
	];
	if (HUMAN_PRESENT_PHASES.includes(phase)) {
		lines.push(architectureLensInstructions());
	}
	return lines.filter((line) => line.length > 0).join("\n");
}

export function phasePrompt(phase: Phase, args: string, cwd: string, routingAddition?: string, conventionsContext = buildConventionsContext(cwd)): string {
	const target = args.trim() || "the current user request / active issue";
	const base = baseContext(cwd, phase, conventionsContext);
	const routing = routingAddition ? `\n\n${routingAddition}` : "";
	const aiGateCommand = conventionsContext.validation.ok ? conventionsContext.config?.toolchain?.commands?.aiGate : undefined;
	const aiGateHardConstraint = aiGateCommand ? `\n- Run the repo AI gate as part of this review: \`${aiGateCommand}\`. Do not skip it because the diff looks small.` : "";
	const aiGateDoneCondition = aiGateCommand ? "\n3. The AI gate command was executed; its must-fix and should-fix findings are folded into the review verdict, or its failure is reported explicitly." : "";
	const aiGateAutoLifecycle = aiGateCommand ? `\n9a. Before closeout, read ${AUTO_REVIEW_LEDGER_REFERENCE}, then run the configured AI gate exactly once for this issue after its commit exists: \`${aiGateCommand}\`. Append its source-tagged outcome and update the same issue commit. PASS continues to closeout. FIX or a concrete remediable BLOCKER enters a fix-worker plus fresh-review cycle while budget remains; use ${AUTO_CHILD_CONTRACTS_REFERENCE} for both children and ${AUTO_ARTIFACTS_REFERENCE} for verification validity. Update the issue commit after the passing follow-up review and never rerun the gate. A non-remediable gate result or exhausted three-cycle budget stops without closing.` : "";

	const prompts: Record<Phase, string> = {
		intake: `${base}${routing}\n\nPhase: INTAKE.\n\nTarget: ${target}\n\nObjective: find the source brief/issue and gather only enough repo context to decide the next workflow step. Use the applicable Matt upstream skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not implement, write specs, create implementation tickets, or close/relabel issues.\n\nDone when every one of these is true (self-check each before finishing):\n1. If the target is a GitHub issue, the issue and its comments were inspected.\n2. The report states: source, current labels/status, missing context, recommended next phase, and whether the work is human-in-loop or AFK-safe.\n\nYour discretion: which repo context to inspect and how deep to go — provided every constraint held and every Done condition is true.`,
		grill: `${base}${routing}\n\nPhase: GRILL / ALIGNMENT.\n\nTarget: ${target}\n\nObjective: interview the user until there is shared understanding of the target, using grill-with-docs when this is codebase work. Use the applicable Matt upstream skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not write a spec or implementation plan until major ambiguity is gone.\n- Create the top-level repo-local \`MATT-GRILL-NOTES.md\` scratch document lazily, only after the first answered question or out-of-scope refactor finding.\n- The Q&A record is append-only.\n\nDone when every one of these is true (self-check each before finishing):\n1. Major ambiguity about the target is resolved, or the open questions are explicitly with the user.\n2. Every answered grill question is appended to the Q&A section of \`MATT-GRILL-NOTES.md\`.\n3. Potential refactors outside the spec scope are captured and updated/grouped in the notes' refactor section.\n\nYour discretion: what to ask, in what order, and when understanding is genuinely shared — provided every constraint held and every Done condition is true.`,
		wayfinder: `${base}${routing}\n\nPhase: WAYFINDER DECISION MAPPING.\n\nTarget: ${target}\n\nObjective: reduce fog for a large, ambiguous, or multi-session destination before specification. Treat a loose destination as chart mode and a map/ticket reference as work mode. Use the applicable Matt upstream skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Planning only: never implement destination work and never hand a cleared map directly to implementation.\n- Chart mode grills breadth-first, exits early to /matt-spec when little fog remains, creates a wayfinder:map plus decision tickets, then wires native blocking/frontier edges in a second pass and stops after charting.\n- Work mode loads the map at low resolution, claims by assignment, and resolves exactly one decision ticket per session. A research ticket may use parallel research subagents, but the session still resolves only that one ticket. Comment and close the ticket, then update Decisions so far, remaining fog, and out-of-scope notes.\n- HITL grilling and prototype tickets require the live user. Never answer for the user and never send them through AFK/auto.\n- Respect the configured tracker and its AGENTS.md/CLAUDE.md indirection; do not hardcode GitHub when another supported tracker is configured.\n\nDone when every one of these is true (self-check each before finishing):\n1. Chart mode stopped after creating and linking planning artifacts, or work mode resolved exactly one decision ticket.\n2. No destination implementation was performed.\n3. A clear map recommends /matt-spec next, followed later by /matt-tickets; it does not recommend /implement.\n\nYour discretion: decision-map breadth, ticket ordering, and research within the active ticket — provided every constraint held and every Done condition is true.`,
		spec: `${base}${routing}\n\nPhase: SPECIFICATION / DESTINATION DOCUMENT.\n\nTarget: ${target}\n\nObjective: synthesize resolved conversation context and durable MATT-GRILL-NOTES.md decisions into a concise tracker specification using to-spec. Do not reopen general interviewing.\n\nHard constraints (tripwires; never trade these away):\n- Do not implement or create implementation tickets.\n- Ask the user to confirm proposed test seams, as required by upstream to-spec.\n- Do not create or assign a milestone unless the user explicitly confirms the exact title and optional due date.\n- If milestone association is requested or considered, read ${MILESTONE_REFERENCE} before associating the spec.\n- Keep out-of-scope refactor candidates out of the spec.\n\nDone when every one of these is true (self-check each before finishing):\n1. The spec captures Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, and Further Notes without low-level paths/snippets except decision-rich prototype excerpts.\n2. Proposed test seams were confirmed and the configured tracker conventions/readiness contract were followed.\n3. Any confirmed milestone is applied and noted on the spec/container issue.\n4. /matt-refactors was recommended before /matt-tickets when grill notes contain refactor candidates.\n\nYour discretion: specification length and tracker location — provided every constraint held and every Done condition is true.`,
		refactors: `${base}${routing}\n\nPhase: POST-SPEC REFACTOR EXTRACTION REVIEW.\n\nTarget: ${target}\n\nObjective: review the out-of-scope refactor candidates gathered during grilling, turn approved ones into GitHub issues, and retire the grill notes. Use the applicable Matt upstream skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not implement.\n- Review only the potential refactors that are outside the spec scope.\n- Never delete \`MATT-GRILL-NOTES.md\` without explicit user confirmation.\n- Do not move into ticket decomposition until the user has been prompted about deletion.\n\nDone when every one of these is true (self-check each before finishing):\n1. The completed spec/issue and the top-level \`MATT-GRILL-NOTES.md\` scratch document (if present) were read.\n2. The user was walked through the candidates quickly with context and asked which should become GitHub issues.\n3. Approved issues were created using the repo tracker conventions and labels.\n4. The user was asked for explicit confirmation before deleting \`MATT-GRILL-NOTES.md\`.\n\nYour discretion: how to group and present candidates — provided every constraint held and every Done condition is true.\n\nSuggested order: read spec and notes -> walk through candidates -> create approved issues -> prompt for notes deletion.`,
		tickets: `${base}${routing}\n\nPhase: TRACER-BULLET TICKET DECOMPOSITION.\n\nTarget: ${target}\n\nObjective: turn the approved spec into independently grabbable tracer-bullet tickets with explicit blocking edges. Prefer native sub-issues and native blocking relationships; use textual ## Parent and ## Blocked by fallbacks where necessary.\n\nHard constraints (tripwires; never trade these away):\n- Preflight gate: if top-level MATT-GRILL-NOTES.md exists and refactor extraction/deletion has not been confirmed, stop and direct the user to /matt-refactors. Create nothing.\n- Do not implement. Generated tickets are already planning-reviewed; do not run ordinary inbound triage over them.\n- Obtain user approval before publishing tickets. Handle wide refactors with expand-contract instead of forcing false vertical slices.\n- Never create a milestone or infer hierarchy from milestone membership without explicit confirmation.\n- If the source spec has a milestone or inheritance is considered, read ${MILESTONE_REFERENCE} before creating child issues.\n- Local augmentation over upstream: update only the generated ## Child issues section on an existing parent/spec issue, preserving every other byte of parent content and never closing the parent. Replace an existing generated section; never duplicate it.\n\nDone when every one of these is true (self-check each before finishing):\n1. Each ticket is an independently agentable tracer bullet, or is explicitly an expand-contract refactor step.\n2. Native or textual parent/blocking edges are present, milestone inheritance was confirmed where applicable, readiness satisfies the existing contract, and issue-aware skill hints reflect each final ticket state.\n3. The parent has exactly one generated ## Child issues index listing links, purpose, readiness, milestone when applied, and blockers.\n4. Anything not satisfied is reported rather than silently skipped.\n\nYour discretion: ticket count, boundaries, and working order — provided every constraint held and every Done condition is true.`,

		afk: `${base}${routing}\n\nPhase: AFK IMPLEMENTATION LOOP.\n\nTarget: ${target}\n\nObjective: implement the smallest passing slice for one unblocked ready-for-agent issue, with fresh verification. Use the applicable Matt upstream skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Work only on unblocked ready-for-agent issues. If none exists, stop and say so.\n- Never implement an issue labeled wayfinder:map or wayfinder:*; redirect it to /matt-wayfinder even if it says AFK or ready-for-agent.\n- Do not claim completion without running fresh verification.\n\nDone when every one of these is true (self-check each before finishing):\n1. Work started from the issue and repo docs, with minimal exploration.\n2. The smallest passing slice is implemented, using TDD where practical.\n3. Fresh verification ran and its results are reported.\n\nYour discretion: implementation approach and test seams — provided every constraint held and every Done condition is true.`,
		review: `${base}${routing}\n\nPhase: FRESH-CONTEXT REVIEW.\n\nTarget: ${target}\n\nObjective: review the target from a fresh context, using the issue/spec, current diff, AGENTS.md, CONTEXT.md, and relevant ADRs as the standard. Use the applicable Matt upstream skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not silently fix unless asked.\n- Treat architecture findings as blockers only when they affect the issue's correctness, maintainability, or future workflow safety; otherwise recommend follow-up issues.${aiGateHardConstraint}\n\nDone when every one of these is true (self-check each before finishing):\n1. The review standard (issue/spec, current diff, AGENTS.md, CONTEXT.md, relevant ADRs) was read.\n2. Findings are reported as file:line with severity and a concrete fix for each.${aiGateDoneCondition}\n\nYour discretion: review depth and ordering — provided every constraint held and every Done condition is true.`,
		closeout: `${base}${routing}\n\nPhase: ISSUE CLOSEOUT.\n\nTarget: ${target}\n\nObjective: verify completion evidence for a specifically named issue or spec target, then comment and close — or recommend the correct next state. Use the applicable Matt upstream skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Close out only a specifically named issue or spec target.\n- Never close without evidence. If evidence is missing, do not close; recommend the next state such as ready-for-agent, needs-info, or ready-for-human with the reason.\n- Do not recommend closing a spec/container until its child issues are complete or explicitly moved out of scope.\n- Ask for confirmation before posting or closing unless the user explicitly asked you to close it now.\n- Do not close the milestone unless the user explicitly asks and confirms.\n- If the issue belongs to a milestone or milestone closeout is considered, read ${MILESTONE_REFERENCE} before reporting or mutating milestone state.\n- Do not implement. Do not commit.\n\nDone when every one of these is true (self-check each before finishing):\n1. The full issue was inspected: comments, current labels, milestone, acceptance criteria, current diff/commits, and fresh verification/review evidence.\n2. If the issue is a spec/container, child issues were discovered from the generated child section or linked issue metadata and their state was reported.\n3. If evidence satisfies the issue, a concise completion comment was drafted that starts with the triage disclaimer required by the triage skill and summarizes what changed and how it was verified.\n4. If the issue belongs to a milestone, its delivery-arc state was reported according to ${MILESTONE_REFERENCE}.\n5. The issue was closed with confirmation, or the recommended next state and reason were reported.\n\nYour discretion: comment wording and how to weigh evidence — provided every constraint held and every Done condition is true.`,
		retro: `${base}${routing}\n\nPhase: REVIEW-LEDGER RETROSPECTIVE.\n\nObjective: read and validate the repo-local \`.pi/matt-review-ledger.jsonl\`, cluster recurring reviewer findings and why workers missed them, then present concrete evidence-backed workflow improvement proposals for human decision.\n\nHard constraints (tripwires; never trade these away):\n- Read the ledger line by line and validate every record against the schema-generated contract and semantics in ${AUTO_REVIEW_LEDGER_REFERENCE}. Accept mixed ledgers and interpret source-less legacy records as \`review-child\`; a present source must be \`review-child\` or \`ai-gate\`. If the ledger is missing, empty, or malformed, stop clearly without fabricating insight; report every malformed line with its line number.\n- Never rewrite, compact, or modify the ledger.\n- Report findings, verdict-only PASS records, distinct executions, category counts, and recorded pass rates separately for \`review-child\` and \`ai-gate\`; do not conflate the review surfaces or infer AI-gate PASS from an absent record.\n- Separate repeats within one issue's fix cycles (a fix-worker contract signal) from category patterns across issues (a worker guidance, skill, routing, or AGENTS.md signal). Give cross-issue clusters explicit priority, report counts and underlying issue/cycle references for both, and propose a prevention tier for every cross-issue cluster. Prefer a deterministic target-repo toolchain check when feasible; otherwise propose target-repo AGENTS.md guidance or a routed skill.\n- Every proposal must name the concrete target file/config and change kind, explain the change, and cite motivating ledger records by issue, cycle, and category. Allowed targets are target-repo \`AGENTS.md\` files, target-repo deterministic toolchain checks, extension-local augmentation files, \`.pi/matt-skill-routes.json\`, or a new skill.\n- Present proposals one at a time and require explicit per-proposal approval before applying each one. Never treat approval of one proposal as approval of another.\n- Never modify vendored content under \`vendor/mattpocock-skills\`; use extension-local augmentations for workflow policy.\n\nDone when every one of these is true (self-check each before finishing):\n1. The ledger was fully validated before analysis, or validation stopped with a clear missing/empty/malformed report.\n2. Valid findings were clustered by category and reported separately for \`review-child\` and \`ai-gate\`, with distinct pass rates, within-issue and across-issue signals, counts, why-missed themes, and issue/cycle references.\n3. Each proposal had a concrete allowed target and cited evidence, was individually approved or rejected, and only explicitly approved proposals were applied.\n4. The final report lists applied and skipped proposals and confirms that the ledger and vendored Matt content were not modified.\n\nYour discretion: clustering labels and proposal ordering — provided every constraint held and every Done condition is true.`,
		auto: `${base}${routing}\n\nPhase: CONTINUOUS AFK AUTO-LOOP.\n\nTarget/filter: ${target}\n\nObjective: act as the Parent Orchestrator—serially implement, review, commit, and close open, unblocked, ready-for-agent child/work issues until a stop rule fires.\n\nHard constraints (tripwires; never trade these away):\n- Never implement a Wayfinder map/decision ticket; labels \`wayfinder:map\` and \`wayfinder:*\` redirect to \`/matt-wayfinder\` and must be re-checked after every queue refresh.\n- Never implement or close a parent/spec/container issue; build the queue from its child issues. Ambiguous parent detection requires a human-decision stop.\n- A Milestone is not a parent and never implies hierarchy. If the target/filter or selected issue involves a Milestone, read ${MILESTONE_REFERENCE} before filtering or reporting.\n- Work serially. Use no parallel execution or worktrees unless the user explicitly requested them for this run.\n- Never poll or inspect repo state while a child is running. Wait for its returned result; a known-long verification attention notice means keep waiting unless the harness reports failure or a stall.\n- When Pi subagent tooling is available, launch builtin \`worker\` children for implementation/fixes and builtin \`reviewer\` children for review, always with \`context: "fresh"\`. Never silently substitute a generic delegate.\n- The Parent Orchestrator exclusively owns review launches, remediation decisions, commits, tracker mutations, and closeout. Children complete only the bounded roles in the child-contract reference.\n- Route every selected issue before launching children. Invalid routing config, a missing selected skill, or high-confidence routed-skill overflow stops before implementation or review.\n- Create one conventional commit per issue and reference that issue. Include its Review Ledger appends in the same commit; never combine issues or make a ledger-only commit.\n- Close only when completion evidence supports it. Otherwise recommend or apply the correct readiness state and stop.\n- Default limits are 10 issues per run and at most three fix/review cycles per issue unless the user supplied different limits. The initial implementation review does not consume a cycle.\n\nLoop contract (each iteration, in order):\n1. Inspect git status. Stop for worktree changes that are neither pre-existing acknowledged user work nor attributable to the just-finished iteration.\n2. Resolve the target/filter into the active queue. With no target, query open \`ready-for-agent\` issues. For a named issue, inspect its body and comments; when it is a parent/spec/container, discover children from explicit child/sub-issue sections, task-list references, decomposition metadata/comments, then native sub-issue or clear linked relationships.\n3. Exclude every \`wayfinder:*\` issue. Filter to open, unblocked, \`ready-for-agent\` child/work issues; respect blocker labels, dependency text, task-list dependencies, and acceptance-criteria dependencies. Order oldest first unless dependencies require otherwise.\n4. Stop when no unblocked ready issue remains, the frontier needs human review, readiness state conflicts, or every child of a parent target is complete. Leave a completed parent open and report that its workflow may continue.\n5. Route the selected issue. Read ${AUTO_ARTIFACTS_REFERENCE} now, then create its private review packet and initialize artifact ownership exactly as specified there.\n6. Launch a fresh implementation child. Read ${AUTO_CHILD_CONTRACTS_REFERENCE} now and use its shared and Implementation child contracts. Give the child the packet path and routed skill pack. Wait for its diff and compact verification handoff, then inspect the returned diff and evidence.\n7. Launch a separate fresh review child. Use the Review child contract in ${AUTO_CHILD_CONTRACTS_REFERENCE}. After it returns, read ${AUTO_REVIEW_LEDGER_REFERENCE} and complete its validating append, recurrence, prevention, and stop-rule mechanics before choosing the next state.\n8. Classify the review outcome. PASS advances. A concrete repo-local FIX or BLOCKER launches a Fix child and then a separate fresh Review child while budget remains; increment the cycle, update the packet/evidence, and repeat from step 7. Stop early only for required human judgment, unclear acceptance criteria or Seam, unpassable verification, or unsafe merge/conflict risk. After cycle 3, a non-PASS stops as budget exhausted.\n9. After review passes, use the verification-invalidation rules in ${AUTO_ARTIFACTS_REFERENCE} to decide whether the completed full check still covers the exact commit inputs. Rerun only when invalidated; never commit on a failing check. A failed rerun re-enters the fix/review cycle while budget remains; otherwise stop as budget exhausted. Commit when passing and issue changes exist.${aiGateAutoLifecycle}\n10. Run closeout: post the AI-generated triage-disclaimed completion comment, summarize changes and verification, and close only with completion evidence. Clean the issue artifacts through ${AUTO_ARTIFACTS_REFERENCE}.\n11. Refresh dependencies and issue state, then continue with the next unblocked ready issue. On every loop exit, run the artifact reference's termination cleanup.\n\nDone when the loop has stopped (self-check before finishing):\n1. A stop rule or default limit fired, its exact reason is stated, and run-created artifacts were cleaned.\n2. The final response contains a compact loop log: parent issue if any; completed and skipped child/work issues; commits; verification; fix/review cycles; Review Ledger records appended per source and issue; suppressed AI-gate duplicates; and the exact blocker/stop reason.\n3. The final response contains \`Guidance-promotion candidates\`: \`none\` when empty, otherwise every earlier-issue repeat with recurring class, category, issue/cycle evidence, prevention issue, and prevention-stop state.`,
	};

	return prompts[phase];
}

function helpText(): string {
	return [
		"Matt workflow extension v4",
		"",
		"Commands:",
		"  /matt-start <issue|brief>   Intake and recommend next phase",
		"  /matt-grill <issue|brief>   Human-in-loop alignment questions",
		"  /matt-wayfinder <destination|map|ticket> Map or resolve planning decisions",
		"  /matt-spec <issue|brief>     Write spec / destination doc",
		"  /matt-refactors <spec|issue> Review out-of-scope grill refactors before ticket decomposition",
		"  /matt-tickets <spec|issue>   Create tracer-bullet tickets and index them on the parent",
		"  /matt-afk [issue|label]     Run single-issue AFK, or auto-loop when no target is supplied",
		"  /matt-auto [filter|parent]  Continuously implement, review, commit, and close ready-for-agent issues; parent issues expand to child issues",
		"  /matt-retro                Propose approved workflow improvements from the review ledger",
		"  /matt-route-skills <issue> Read-only dry run of issue-aware skill routing",
		"  /matt-init-skill-routes    Scaffold .pi/matt-skill-routes.json without overwriting",
		"  /matt-init-conventions     Scaffold .pi/matt-conventions.json without overwriting",
		"  /matt-review <diff|issue>   Fresh-context review",
		"  /matt-closeout <issue>      Verify completion evidence, comment, and close/relabel an issue",
		"  /matt-status                Show workflow status/checklist",
		"  /matt-milestone [name|#]    Review a GitHub milestone as a delivery arc without implementing",
		"  /matt-arch-lens [target]    Quick deep-module learning lens over a target",
		"  /matt-arch-gym [target]     Practice Module/Interface/Depth recognition with coaching",
		"  /matt-skills [phase]        Show phase-specific Matt engineering skill references",
		"  /matt-profile               Show minimal Pi boot command",
		"",
		"Minimal boot example:",
		`  pi --no-skills --no-extensions -e ${path.join(EXTENSION_ROOT, "index.ts")} --skill ${path.join(workflowSkillPath(), "matt-workflow")}`,
	].join("\n");
}

function skillsText(phase?: PhaseWithStatus): string {
	const phases = phase ? [phase] : ([...PHASES, "status"] as PhaseWithStatus[]);
	return phases
		.map((phaseName) => {
			const refs = availableSkills(phaseName);
			const augmentations = availableAugmentations(phaseName);
			const skillBody = refs.length
				? refs.map((ref) => `  - ${ref.name}: ${ref.absolutePath}\n    Use when: ${ref.useWhen}`).join("\n")
				: "  - none found";
			const augmentationBody = augmentations.length
				? augmentations.map((ref) => `  - ${ref.name}: ${ref.absolutePath}\n    Use when: ${ref.useWhen}`).join("\n")
				: "  - none found";
			return `${phaseName}:\nUpstream Matt skills:\n${skillBody}\nLocal augmentations:\n${augmentationBody}`;
		})
		.join("\n\n");
}

function statusPrompt(cwd: string, conventionsContext = buildConventionsContext(cwd)): string {
	return [
		baseContext(cwd, "status", conventionsContext),
		"",
		"Phase: STATUS.",
		"",
		"Use applicable Matt upstream skill files above. Inspect the current repo/session state enough to summarize Matt workflow progress. Check relevant GitHub issue references, changed files, durable artifacts, labels, and milestone association when a target issue is obvious.",
		`If the status target belongs to a milestone, read ${MILESTONE_REFERENCE} before reporting milestone progress and follow its reporting checklist.`,
		"Output a compact checklist across phases: intake, grill, Wayfinder, spec, tickets, AFK, review, closeout, auto-loop, milestone/delivery-arc status, durable-doc updates. Do not implement.",
	].join("\n");
}

function milestonePrompt(args: string, cwd: string, conventionsContext = buildConventionsContext(cwd)): string {
	const target = args.trim() || "the current repo milestones / active delivery arc";
	return [
		baseContext(cwd, "status", conventionsContext),
		"",
		"Phase: MILESTONE STATUS / DELIVERY ARC REVIEW.",
		"",
		`Target milestone/filter: ${target}`,
		"",
		"Use applicable Matt upstream skill files above for issue tracker conventions.",
		`Read ${MILESTONE_REFERENCE} before inspecting or reporting this milestone, then follow its hierarchy, reporting, and mutation rules.`,
		"Inspect GitHub milestones and issues with gh. If the target names a milestone, resolve it by title or number. If no target is supplied, list open milestones and ask which one to review unless there is an obvious active milestone in context.",
		"",
		"Report every item required by the canonical Milestone reference.",
		"Do not implement, create issues, close issues, relabel issues, create milestones, or close milestones from this command unless the user explicitly asks in a follow-up.",
	].join("\n");
}

function architectureGymPrompt(args: string, cwd: string, conventionsContext = buildConventionsContext(cwd)): string {
	const target = args.trim() || "the current issue / active feature / recent workflow context";
	return [
		baseContext(cwd, "grill", conventionsContext),
		"",
		"Mode: ARCHITECTURE GYM.",
		"",
		`Target: ${target}`,
		"",
		"This is a teaching/practice mode, not an architecture review. Use repo examples and GitHub issues only to illustrate the user's mental model.",
		"Keep it high-level unless the user asks to go deeper. Do not implement, write specs, create issues, or propose final interfaces.",
		"",
		"Run this coaching loop:",
		"1. Pick one small excerpt from the target context: an issue, route, workflow, or feature slice.",
		"2. Ask the user to answer first using this template:",
		"   - Module/domain concept:",
		"   - Interface: what must callers know?",
		"   - Hidden caller knowledge:",
		"   - Deletion test:",
		"   - Seam: real or hypothetical?",
		"   - Leverage:",
		"   - Locality:",
		"   - Test surface:",
		"3. After they answer, coach: what they spotted well, what is fuzzy, what term to sharpen, and one better question to ask next.",
		"4. Offer another rep or ask whether they want to move back to the normal Matt workflow phase.",
	].join("\n");
}

function architectureLensPrompt(args: string, cwd: string, conventionsContext = buildConventionsContext(cwd)): string {
	const target = args.trim() || "the current issue / active feature / recent workflow context";
	return [
		baseContext(cwd, "grill", conventionsContext),
		"",
		"Mode: QUICK ARCHITECTURE LENS.",
		"",
		`Target: ${target}`,
		"",
		"Do a compact architecture-learning pass. This is not a full improve-codebase-architecture run.",
		"Use current repo/issue context as examples, keep the result high-level, and avoid proposing detailed interfaces unless asked.",
		"",
		"Output:",
		"- Likely Module/domain concept",
		"- Current or implied Interface",
		"- Hidden caller knowledge to watch for",
		"- Deletion test result",
		"- Seam reality check",
		"- Where Leverage or Locality might improve",
		"- One question for the user to exercise their mental model",
	].join("\n");
}

export default function mattWorkflowExtension(pi: ExtensionAPI) {
	pi.on("resources_discover", async () => {
		const vendorCategoryPaths = PROMOTED_MATT_VENDOR_CATEGORIES.map((category) => path.join(MATT_VENDOR_ROOT, category));
		const skillPaths = [workflowSkillPath(), ...vendorCategoryPaths].filter((skillPathForPi) => existsSync(skillPathForPi));
		if (skillPaths.length === 0) return;
		return { skillPaths };
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus(EXTENSION_NAME, "Matt workflow ready");
	});

	pi.registerCommand("matt-help", {
		description: "Show Matt Pocock AI feature workflow commands",
		handler: async (_args, ctx) => ctx.ui.notify(helpText(), "info"),
	});

	pi.registerCommand("matt-profile", {
		description: "Show a minimal Pi boot command for this workflow",
		handler: async (_args, ctx) => ctx.ui.notify(helpText(), "info"),
	});

	pi.registerCommand("matt-skills", {
		description: "Show phase-specific Matt Pocock engineering skill references",
		getArgumentCompletions: (prefix) => {
			const values = [...PHASES, "status"];
			const filtered = values.filter((value) => value.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const phase = args.trim() as PhaseWithStatus | "";
			ctx.ui.notify(skillsText(phase || undefined), "info");
		},
	});

	pi.registerCommand("matt-route-skills", {
		description: "Read-only dry run of issue-aware skill routing for a GitHub issue",
		getArgumentCompletions: (prefix) => {
			const suggestions = ["#", "https://github.com/OWNER/REPO/issues/NUMBER"];
			const filtered = suggestions.filter((item) => item.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const target = args.trim();
			if (!target) {
				ctx.ui.notify("Usage: /matt-route-skills <GitHub issue number|URL>. This dry run does not accept arbitrary text.", "info");
				return;
			}
			const routed = routeGithubIssueTarget(target, ctx.cwd);
			if (!routed.ok) {
				ctx.ui.notify(routed.message, "info");
				return;
			}
			ctx.ui.notify(formatDryRun(routed.result), "info");
		},
	});

	pi.registerCommand("matt-init-skill-routes", {
		description: "Scaffold .pi/matt-skill-routes.json without overwriting",
		handler: async (_args, ctx) => {
			const result = scaffoldSkillRoutes(ctx.cwd);
			ctx.ui.notify(result.message, "info");
		},
	});

	pi.registerCommand("matt-init-conventions", {
		description: "Scaffold .pi/matt-conventions.json without overwriting",
		handler: async (_args, ctx) => {
			const result = scaffoldConventions(ctx.cwd);
			ctx.ui.notify(result.message, "info");
		},
	});

	pi.registerCommand("matt-status", {
		description: "Ask the agent to summarize current workflow phase/status",
		handler: async (_args, ctx) => {
			const conventionsContext = buildConventionsContext(ctx.cwd);
			const failure = combinedConfigFailure(conventionsContext);
			if (failure) {
				ctx.ui.notify(failure, "info");
				return;
			}
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "status", at: Date.now() });
			pi.sendUserMessage(statusPrompt(ctx.cwd, conventionsContext));
		},
	});

	pi.registerCommand("matt-milestone", {
		description: "Review a GitHub milestone as a human-facing delivery arc",
		getArgumentCompletions: (prefix) => {
			const suggestions = ["current milestone", "open milestones", "#"];
			const filtered = suggestions.filter((item) => item.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const conventionsContext = buildConventionsContext(ctx.cwd);
			const failure = combinedConfigFailure(conventionsContext);
			if (failure) {
				ctx.ui.notify(failure, "info");
				return;
			}
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "milestone", args: args.trim(), at: Date.now() });
			pi.sendUserMessage(milestonePrompt(args, ctx.cwd, conventionsContext));
		},
	});

	pi.registerCommand("matt-arch-lens", {
		description: "Run a quick deep-module learning lens over a target",
		getArgumentCompletions: (prefix) => {
			const suggestions = ["#", "current issue", "current diff", "active feature"];
			const filtered = suggestions.filter((item) => item.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const conventionsContext = buildConventionsContext(ctx.cwd);
			const failure = combinedConfigFailure(conventionsContext);
			if (failure) {
				ctx.ui.notify(failure, "info");
				return;
			}
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "architecture-lens", args: args.trim(), at: Date.now() });
			pi.sendUserMessage(architectureLensPrompt(args, ctx.cwd, conventionsContext));
		},
	});

	pi.registerCommand("matt-arch-gym", {
		description: "Practice Module/Interface/Depth recognition with coaching",
		getArgumentCompletions: (prefix) => {
			const suggestions = ["#", "current issue", "current diff", "active feature"];
			const filtered = suggestions.filter((item) => item.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const conventionsContext = buildConventionsContext(ctx.cwd);
			const failure = combinedConfigFailure(conventionsContext);
			if (failure) {
				ctx.ui.notify(failure, "info");
				return;
			}
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "architecture-gym", args: args.trim(), at: Date.now() });
			pi.sendUserMessage(architectureGymPrompt(args, ctx.cwd, conventionsContext));
		},
	});

	const registerPhase = (command: string, phase: Phase, description: string, fresh = false, routeAware = false, acceptsTarget = true) => {
		pi.registerCommand(command, {
			description,
			...(acceptsTarget ? {
				getArgumentCompletions: (prefix: string) => {
					const suggestions = ["#", "current issue", "current diff", "active feature"];
					const filtered = suggestions.filter((item) => item.startsWith(prefix));
					return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
				},
			} : {}),
			handler: async (args, ctx) => {
				const conventionsContext = buildConventionsContext(ctx.cwd);
				const routingContext = routeAware ? routeConfigContext(ctx.cwd) : undefined;
				const failure = combinedConfigFailure(conventionsContext, routingContext?.validation);
				if (failure) {
					ctx.ui.notify(failure, "info");
					return;
				}
				let routingAddition = routeAware ? routingAwarePromptAddition(phase, args, ctx.cwd) : undefined;
				if (routeAware && phase === "auto" && isGithubIssueTarget(args.trim())) {
					const routed = routeGithubIssueTarget(args.trim(), ctx.cwd);
					if (!routed.ok) {
						ctx.ui.notify(routed.message, "info");
						return;
					}
					if (isWayfinderPlanningIssue(routed.result.issue)) {
						ctx.ui.notify(wayfinderRedirectMessage(), "info");
						return;
					}
					if (!routed.result.validation.ok) {
						ctx.ui.notify(formatDryRun(routed.result), "info");
						return;
					}
					routingAddition = formatRoutingPromptContract(routed.result);
				}
				const prompt = phasePrompt(phase, args, ctx.cwd, routingAddition, conventionsContext);
				pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase, args: args.trim(), at: Date.now() });

				if (fresh) {
					await ctx.waitForIdle();
					await ctx.newSession({
						parentSession: ctx.sessionManager.getSessionFile(),
						withSession: async (newCtx) => await newCtx.sendUserMessage(prompt),
					});
					return;
				}

				pi.sendUserMessage(prompt);
			},
		});
	};

	registerPhase("matt-start", "intake", "Start Matt workflow intake for an issue or brief");
	registerPhase("matt-grill", "grill", "Run human-in-loop grilling for a feature/issue");
	registerPhase("matt-wayfinder", "wayfinder", "Map decisions for large, foggy, multi-session work");
	registerPhase("matt-spec", "spec", "Create a specification / destination document from resolved context");
	registerPhase("matt-refactors", "refactors", "Review out-of-scope grill refactors before ticket decomposition");
	registerPhase("matt-tickets", "tickets", "Turn a specification into tracer-bullet tickets", false, true);

	pi.registerCommand("matt-afk", {
		description: "Start a single-issue AFK loop, or auto-loop when no target is supplied",
		getArgumentCompletions: (prefix) => {
			const suggestions = ["#", "ready-for-agent", "current issue", "active feature"];
			const filtered = suggestions.filter((item) => item.startsWith(prefix));
			return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const trimmedArgs = args.trim();
			const phase: Phase = trimmedArgs ? "afk" : "auto";
			const conventionsContext = buildConventionsContext(ctx.cwd);
			const routingContext = routeConfigContext(ctx.cwd);
			const failure = combinedConfigFailure(conventionsContext, routingContext.validation);
			if (failure) {
				ctx.ui.notify(failure, "info");
				return;
			}
			const routed = trimmedArgs && isGithubIssueTarget(trimmedArgs) ? routeGithubIssueTarget(trimmedArgs, ctx.cwd) : undefined;
			if (routed && !routed.ok) {
				ctx.ui.notify(routed.message, "info");
				return;
			}
			if (routed?.ok && isWayfinderPlanningIssue(routed.result.issue)) {
				ctx.ui.notify(wayfinderRedirectMessage(), "info");
				return;
			}
			if (routed?.ok && !routed.result.validation.ok) {
				ctx.ui.notify(formatDryRun(routed.result), "info");
				return;
			}
			const prompt = phasePrompt(phase, trimmedArgs, ctx.cwd, routed?.ok ? formatRoutingPromptContract(routed.result) : routingAwarePromptAddition(phase, trimmedArgs, ctx.cwd), conventionsContext);
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase, args: trimmedArgs, at: Date.now() });

			if (!trimmedArgs) {
				pi.sendUserMessage(prompt);
				return;
			}

			await ctx.waitForIdle();
			await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
				withSession: async (newCtx) => await newCtx.sendUserMessage(prompt),
			});
		},
	});

	registerPhase("matt-auto", "auto", "Continuously implement, review, commit, and close ready-for-agent issues", false, true);
	registerPhase("matt-retro", "retro", "Analyze the review ledger and propose human-approved workflow improvements", false, false, false);
	registerPhase("matt-review", "review", "Start a fresh-context review", true);
	registerPhase("matt-closeout", "closeout", "Verify completion evidence and close/relabel an issue");

	pi.registerCommand("matt-next", {
		description: "Choose the next Matt workflow phase interactively",
		handler: async (args, ctx) => {
			const conventionsContext = buildConventionsContext(ctx.cwd);
			const failure = combinedConfigFailure(conventionsContext);
			if (failure) {
				ctx.ui.notify(failure, "info");
				return;
			}
			if (!ctx.hasUI) {
				pi.sendUserMessage(phasePrompt("intake", args, ctx.cwd, undefined, conventionsContext));
				return;
			}

			const choice = await ctx.ui.select(
				"Choose Matt workflow phase",
				PHASES.map((phase) => `${phase} — ${phase === "afk" || phase === "review" ? "fresh context" : "current context"}`),
			);

			if (!choice) return;
			const phase = choice.split(" — ")[0] as Phase;
			const prompt = phasePrompt(phase, args, ctx.cwd, undefined, conventionsContext);
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase, args: args.trim(), at: Date.now() });

			if (phase === "afk" || phase === "review") {
				await ctx.waitForIdle();
				await ctx.newSession({
					parentSession: ctx.sessionManager.getSessionFile(),
					withSession: async (newCtx) => await newCtx.sendUserMessage(prompt),
				});
				return;
			}

			pi.sendUserMessage(prompt);
		},
	});
}
