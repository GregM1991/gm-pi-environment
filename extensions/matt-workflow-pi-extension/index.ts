import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConventionsContext, formatConventionsDiagnostics, scaffoldConventions } from "./conventions/config";
import { formatConventionsHints } from "./conventions/hints";
import type { ConventionsContext } from "./conventions/types";
import { buildRoutingContext, formatValidationDiagnostics, scaffoldSkillRoutes } from "./skill-routing/config";
import { formatDryRun, formatRoutingPromptContract, formatSliceSkillHintInstructions } from "./skill-routing/format";
import { routeIssue } from "./skill-routing/router";
import type { IssueEvidence, RouteResult, RoutingContext, ValidationResult } from "./skill-routing/types";

type Phase = "intake" | "grill" | "prd" | "refactors" | "slice" | "afk" | "review" | "closeout" | "auto";
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
const PHASES: Phase[] = ["intake", "grill", "prd", "refactors", "slice", "afk", "review", "closeout", "auto"];
const EXTENSION_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MATT_VENDOR_ROOT = path.join(EXTENSION_ROOT, "vendor", "mattpocock-skills");
const MATT_ENGINEERING_SKILLS_ROOT = path.join(MATT_VENDOR_ROOT, "engineering");
// Synced upstream categories (all except deprecated); vendor is the canonical
// copy of Matt's skills, so none of these are duplicated in the environment's skills/.
const MATT_VENDOR_CATEGORIES = ["engineering", "productivity", "misc", "personal", "in-progress"];
const AUGMENTATIONS_ROOT = path.join(EXTENSION_ROOT, "augmentations");

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

// Intentionally only Matt Pocock skills from skills/engineering in
// https://github.com/mattpocock/skills.
const PHASE_SKILLS: Record<PhaseWithStatus, SkillRef[]> = {
	intake: [
		skill("ask-matt", "ask-matt/SKILL.md", "choosing which Matt skill or workflow phase fits the situation"),
		skill("triage", "triage/SKILL.md", "creating, triaging, or preparing issue-tracker work"),
		skill("setup-matt-pocock-skills", "setup-matt-pocock-skills/SKILL.md", "setting up Matt Pocock skill repo conventions in a repo"),
	],
	grill: [
		skill("grill-with-docs", "grill-with-docs/SKILL.md", "codebase work that should challenge plans against CONTEXT.md and ADRs"),
		skill("domain-modeling", "domain-modeling/SKILL.md", "pinning down domain terminology or a ubiquitous language during alignment"),
		skill("research", "research/SKILL.md", "delegating primary-source docs/API research to a background agent while grilling continues"),
		skill("prototype", "prototype/SKILL.md", "a throwaway prototype would flush out a design before committing"),
		skill("codebase-design", "codebase-design/SKILL.md", "using deep-module vocabulary while shaping architecture-sensitive plans"),
		skill("improve-codebase-architecture", "improve-codebase-architecture/SKILL.md", "architecture/deep-module opportunities discovered while shaping a plan"),
	],
	prd: [
		skill("to-prd", "to-prd/SKILL.md", "turning conversation context into a PRD on the issue tracker"),
		skill("domain-modeling", "domain-modeling/SKILL.md", "recording canonical domain terms and decisions discovered while writing the PRD"),
	],
	refactors: [
		skill("triage", "triage/SKILL.md", "creating follow-up refactor issues and applying tracker labels"),
		skill("improve-codebase-architecture", "improve-codebase-architecture/SKILL.md", "classifying out-of-scope architecture/refactor candidates before issue extraction"),
	],
	slice: [
		skill("to-issues", "to-issues/SKILL.md", "breaking a PRD/plan into independently grabbable vertical-slice issues"),
		skill("triage", "triage/SKILL.md", "applying issue labels and readiness state"),
	],
	afk: [
		skill("implement", "implement/SKILL.md", "implementing a piece of work based on a PRD or issue"),
		skill("tdd", "tdd/SKILL.md", "test-first implementation with red-green-refactor"),
		skill("diagnosing-bugs", "diagnosing-bugs/SKILL.md", "hard bugs or performance regressions needing disciplined diagnosis"),
		skill("resolving-merge-conflicts", "resolving-merge-conflicts/SKILL.md", "an in-progress merge or rebase conflict blocks implementation"),
	],
	review: [
		skill("code-review", "code-review/SKILL.md", "two-axis Standards/Spec review of the diff against a fixed point"),
		skill("codebase-design", "codebase-design/SKILL.md", "review needs deep-module vocabulary or interface-quality assessment"),
		skill("improve-codebase-architecture", "improve-codebase-architecture/SKILL.md", "review identifies architecture/deep-module improvement opportunities"),
		skill("diagnosing-bugs", "diagnosing-bugs/SKILL.md", "review finds a hard bug requiring disciplined reproduction"),
	],
	closeout: [
		skill("triage", "triage/SKILL.md", "checking issue labels/state before closing or relabeling"),
	],
	auto: [
		skill("triage", "triage/SKILL.md", "finding and ordering ready-for-agent issues and detecting blocker labels"),
		skill("implement", "implement/SKILL.md", "implementation worker contracts for issue-based work"),
		skill("tdd", "tdd/SKILL.md", "implementation worker contracts should prefer test-first slices"),
		skill("code-review", "code-review/SKILL.md", "review child contracts: two-axis Standards/Spec review of each issue's diff"),
		skill("diagnosing-bugs", "diagnosing-bugs/SKILL.md", "worker or review loops hit hard bugs or regressions"),
		skill("codebase-design", "codebase-design/SKILL.md", "review detects interface or deep-module design issues that should stop auto mode"),
		skill("improve-codebase-architecture", "improve-codebase-architecture/SKILL.md", "review detects architectural issues that should stop auto mode"),
	],
	status: [
		skill("ask-matt", "ask-matt/SKILL.md", "checking which workflow phase should happen next"),
		skill("triage", "triage/SKILL.md", "checking issue state and labels"),
	],
};

// Most phase policy now lives directly in the phase prompts (objective/constraints/done-when).
// Augmentation files remain only where they add content beyond the prompt: grill templates
// and status/milestone reporting policy (whose prompts were not rewritten).
const PHASE_AUGMENTATIONS: Record<PhaseWithStatus, AugmentationRef[]> = {
	intake: [],
	grill: [augmentation("grill", "grill.md", "local Q&A and refactor-candidate templates for the MATT-GRILL-NOTES.md scratch document")],
	prd: [],
	refactors: [],
	slice: [],
	afk: [],
	review: [],
	closeout: [],
	auto: [],
	status: [augmentation("status", "status.md", "local workflow and milestone status reporting policy")],
};

function workflowSkillPath(): string {
	return path.join(EXTENSION_ROOT, "skills");
}

function skillPath(ref: SkillRef): string {
	return path.join(MATT_ENGINEERING_SKILLS_ROOT, ref.relativePath);
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
	if (refs.length === 0) {
		return "Phase skills: no Matt Pocock engineering skill files found on disk. Stop and report the missing vendored skills.";
	}

	return [
		"Phase skills are loaded into Pi from the vendored mattpocock/skills folders and are also listed here with absolute paths for this phase.",
		"Use only the listed phase skills that actually apply to this target. If a listed skill does not fit the task, skip it and briefly say why.",
		"Use only skills listed in this phase prompt or assigned to you via a skill pack (baseline plus routed skills); do not pull in other skills as workflow guidance on your own. Using Pi extension tools such as subagent orchestration is allowed when the phase prompt explicitly asks for orchestration.",
		"Relevant phase engineering skill files:",
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
		"Phase augmentations are local matt-workflow policy layered on top of the vendored upstream Matt engineering skills.",
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
	if (phase === "slice") {
		const routingContext = routeConfigContext(cwd);
		return formatSliceSkillHintInstructions(routingContext.validation);
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
			"- Before implementation, select exactly one open ready-for-agent issue, fetch it with `gh issue view <number> --json number,url,title,body,labels`, include explicit file-like title/body paths as path evidence, then run the same route computation used by `/matt-route-skills`.",
			"- Stop before implementation on invalid routing config, missing routed skills, or high-confidence routed-skill overflow. Medium-confidence overflow may be trimmed to the cap.",
			"- Worker/review child contracts must include selected skill IDs, absolute SKILL.md paths, evidence-backed rationale, and mandatory upfront guidance to read selected skill files before acting.",
			"- Ask workers for only a compact `Skill adjustments` line (`none` when unchanged); do not add audit ceremony and do not name skills in commits or closeout comments.",
		].join("\n");
	}
	if (phase === "auto") {
		return [
			"Issue-aware skill routing contract:",
			"- Route config was validated before this auto loop prompt was sent.",
			"- This prompt-driven queue flow discovers the next concrete issue after command launch; the extension does not change queue ordering and cannot precompute every per-issue pack before the queue is resolved.",
			"- For each selected child/work issue, fetch the issue with `gh issue view <number> --json number,url,title,body,labels`, include explicit file-like title/body paths as path evidence, and route that selected issue before launching worker or review agents.",
			"- If routing validation fails for the selected issue, a selected routed skill is missing, or high-confidence routed skills exceed the active cap, do not launch implementation/review; report the routing stop reason in the compact final loop log. Medium-confidence overflow may be trimmed to the cap.",
			"- Worker/review child contracts must include selected skill IDs, absolute SKILL.md paths, evidence-backed rationale, and mandatory upfront guidance to read selected skill files before acting.",
			"- Ask workers for only a compact `Skill adjustments` line (`none` when unchanged); do not add audit ceremony and do not name skills in commits or closeout comments.",
		].join("\n");
	}
	return undefined;
}

// The architecture learning lens rehearses the *user's* mental model, so it only
// belongs in phases where a human is present — never in unattended afk/auto workers.
const HUMAN_PRESENT_PHASES: PhaseWithStatus[] = ["intake", "grill", "prd", "refactors", "slice", "review", "closeout", "status"];

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

function phasePrompt(phase: Phase, args: string, cwd: string, routingAddition?: string, conventionsContext = buildConventionsContext(cwd)): string {
	const target = args.trim() || "the current user request / active issue";
	const base = baseContext(cwd, phase, conventionsContext);
	const routing = routingAddition ? `\n\n${routingAddition}` : "";

	const prompts: Record<Phase, string> = {
		intake: `${base}${routing}\n\nPhase: INTAKE.\n\nTarget: ${target}\n\nObjective: find the source brief/issue and gather only enough repo context to decide the next workflow step. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not implement, write PRDs, create slice issues, or close/relabel issues.\n\nDone when every one of these is true (self-check each before finishing):\n1. If the target is a GitHub issue, the issue and its comments were inspected.\n2. The report states: source, current labels/status, missing context, recommended next phase, and whether the work is human-in-loop or AFK-safe.\n\nYour discretion: which repo context to inspect and how deep to go — provided every constraint held and every Done condition is true.`,
		grill: `${base}${routing}\n\nPhase: GRILL / ALIGNMENT.\n\nTarget: ${target}\n\nObjective: interview the user until there is shared understanding of the target, using grill-with-docs when this is codebase work. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not write a PRD or implementation plan until major ambiguity is gone.\n- Create the top-level repo-local \`MATT-GRILL-NOTES.md\` scratch document lazily, only after the first answered question or out-of-scope refactor finding.\n- The Q&A record is append-only.\n\nDone when every one of these is true (self-check each before finishing):\n1. Major ambiguity about the target is resolved, or the open questions are explicitly with the user.\n2. Every answered grill question is appended to the Q&A section of \`MATT-GRILL-NOTES.md\`.\n3. Potential refactors outside the PRD scope are captured and updated/grouped in the notes' refactor section.\n\nYour discretion: what to ask, in what order, and when understanding is genuinely shared — provided every constraint held and every Done condition is true.`,
		prd: `${base}${routing}\n\nPhase: PRD / DESTINATION DOCUMENT.\n\nTarget: ${target}\n\nObjective: turn resolved context into a concise PRD/delivery brief or tracker PRD, following the selected skill. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not implement.\n- Do not create a milestone unless the user explicitly asks or confirms; when creating one, confirm the exact title and optional due date first, then use gh/GitHub.\n- Milestones are optional human-facing delivery arcs above PRDs; they do not replace the PRD -> child issue hierarchy.\n- Do not include out-of-scope refactor candidates in the PRD.\n\nDone when every one of these is true (self-check each before finishing):\n1. The PRD captures the resolved direction, using durable Q&A decisions from \`MATT-GRILL-NOTES.md\` when it exists.\n2. If the user mentioned a release, delivery arc, feature direction, or milestone, they were asked whether this PRD should be associated with an existing GitHub milestone or a newly confirmed milestone.\n3. If a milestone was confirmed and a PRD issue was published or updated, the milestone is applied to the PRD issue and the association is noted in the PRD body.\n4. The formal refactor-review phase was recommended before slicing.\n\nYour discretion: PRD structure, length, and where it lives — provided every constraint held and every Done condition is true.`,
		refactors: `${base}${routing}\n\nPhase: POST-PRD REFACTOR EXTRACTION REVIEW.\n\nTarget: ${target}\n\nObjective: review the out-of-scope refactor candidates gathered during grilling, turn approved ones into GitHub issues, and retire the grill notes. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not implement.\n- Review only the potential refactors that are outside the PRD scope.\n- Never delete \`MATT-GRILL-NOTES.md\` without explicit user confirmation.\n- Do not move into slicing until the user has been prompted about deletion.\n\nDone when every one of these is true (self-check each before finishing):\n1. The completed PRD/issue and the top-level \`MATT-GRILL-NOTES.md\` scratch document (if present) were read.\n2. The user was walked through the candidates quickly with context and asked which should become GitHub issues.\n3. Approved issues were created using the repo tracker conventions and labels.\n4. The user was asked for explicit confirmation before deleting \`MATT-GRILL-NOTES.md\`.\n\nYour discretion: how to group and present candidates — provided every constraint held and every Done condition is true.\n\nSuggested order: read PRD and notes -> walk through candidates -> create approved issues -> prompt for notes deletion.`,
		slice: `${base}${routing}\n\nPhase: VERTICAL-SLICE ISSUE DECOMPOSITION.\n\nTarget: ${target}\n\nObjective: turn the target PRD into GitHub child issues — each an independently grabbable vertical tracer-bullet slice — with the parent issue updated to index them. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Preflight gate: if top-level \`MATT-GRILL-NOTES.md\` exists and refactor extraction/deletion has not been confirmed, stop and direct the user to the post-PRD refactor extraction review. Create nothing.\n- Do not implement.\n- Milestones are delivery grouping only; never derive slice hierarchy from them.\n- Never create a milestone without explicit user confirmation. If the user named one, verify it exists before using it. If parent-milestone inheritance is unclear, ask before creating any issues.\n\nDone when every one of these is true (self-check each before finishing):\n1. Every created issue is a vertical slice; none is a horizontal database/API/UI layer phase.\n2. Every child issue carries a readiness label recommendation, explicit dependency/blocker notes (\`blocked by #123\`) wherever order matters, and — when one applies — the parent's milestone (inherited by default) or the user-confirmed milestone.\n3. The parent/PRD issue contains exactly one generated \`## Child issues\` section listing each child: number/link, one-line purpose, readiness recommendation, milestone if applied, blockers. Prior parent content is preserved; an existing generated section is replaced, never duplicated.\n4. Anything you could not satisfy is reported to the user, not silently skipped.\n\nYour discretion: slice count and boundaries, issue titles/bodies, working order — provided every constraint held and every Done condition is true.\n\nSuggested order: preflight -> slice -> create children -> update parent.`,

		afk: `${base}${routing}\n\nPhase: AFK IMPLEMENTATION LOOP.\n\nTarget: ${target}\n\nObjective: implement the smallest passing slice for one unblocked ready-for-agent issue, with fresh verification. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Work only on unblocked ready-for-agent issues. If none exists, stop and say so.\n- Do not claim completion without running fresh verification.\n\nDone when every one of these is true (self-check each before finishing):\n1. Work started from the issue and repo docs, with minimal exploration.\n2. The smallest passing slice is implemented, using TDD where practical.\n3. Fresh verification ran and its results are reported.\n\nYour discretion: implementation approach and test seams — provided every constraint held and every Done condition is true.`,
		review: `${base}${routing}\n\nPhase: FRESH-CONTEXT REVIEW.\n\nTarget: ${target}\n\nObjective: review the target from a fresh context, using the issue/PRD, current diff, AGENTS.md, CONTEXT.md, and relevant ADRs as the standard. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Do not silently fix unless asked.\n- Treat architecture findings as blockers only when they affect the issue's correctness, maintainability, or future workflow safety; otherwise recommend follow-up issues.\n\nDone when every one of these is true (self-check each before finishing):\n1. The review standard (issue/PRD, current diff, AGENTS.md, CONTEXT.md, relevant ADRs) was read.\n2. Findings are reported as file:line with severity and a concrete fix for each.\n\nYour discretion: review depth and ordering — provided every constraint held and every Done condition is true.`,
		closeout: `${base}${routing}\n\nPhase: ISSUE CLOSEOUT.\n\nTarget: ${target}\n\nObjective: verify completion evidence for a specifically named issue or PRD target, then comment and close — or recommend the correct next state. Use the applicable Matt engineering skill files above.\n\nHard constraints (tripwires; never trade these away):\n- Close out only a specifically named issue or PRD target.\n- Never close without evidence. If evidence is missing, do not close; recommend the next state such as ready-for-agent, needs-info, or ready-for-human with the reason.\n- Do not recommend closing a PRD/container until its child issues are complete or explicitly moved out of scope.\n- Ask for confirmation before posting or closing unless the user explicitly asked you to close it now.\n- Do not close the milestone unless the user explicitly asks and confirms.\n- Do not implement. Do not commit.\n\nDone when every one of these is true (self-check each before finishing):\n1. The full issue was inspected: comments, current labels, milestone, acceptance criteria, current diff/commits, and fresh verification/review evidence.\n2. If the issue is a PRD/container, child issues were discovered from the generated child section or linked issue metadata and their state was reported.\n3. If evidence satisfies the issue, a concise completion comment was drafted that starts with the triage disclaimer required by the triage skill and summarizes what changed and how it was verified.\n4. If the issue belongs to a milestone, its state was reported: complete, still has open PRDs/child work, or needs human cleanup.\n5. The issue was closed with confirmation, or the recommended next state and reason were reported.\n\nYour discretion: comment wording and how to weigh evidence — provided every constraint held and every Done condition is true.`,
		auto: `${base}${routing}\n\nPhase: CONTINUOUS AFK AUTO-LOOP.\n\nTarget/filter: ${target}\n\nObjective: act as the parent orchestrator — continuously implement, review, commit, and close open, unblocked, ready-for-agent child/work issues, serially, until a stop rule fires. Use the applicable Matt engineering skill files above for issue queue state, worker contracts, review standards, and closeout decisions.\n\nHard constraints (tripwires; never trade these away):\n- Never implement or close a parent/PRD/container issue; build the queue from its child issues. If parent detection is ambiguous, stop and report what needs human clarification instead of implementing the parent.\n- A milestone is not a parent issue and shared milestone membership must not be used by itself to infer PRD/child hierarchy. A milestone target/filter is only a queue filter over open ready-for-agent issues in that milestone; stop if milestone membership does not make the work relationship clear.\n- Work serially. Do not use parallel execution or worktrees unless the user explicitly asks for it in this run.\n- If the Pi subagent extension/tooling is available, use it to launch fresh-context child agents; do not make child agents run their own subagent workflows.\n- Route each selected issue before launching children. Stop before implementation/review on invalid routing config, missing selected routed skills, or high-confidence routed-skill overflow.\n- One commit per issue with a conventional commit message referencing the issue; do not combine multiple issues in one commit.\n- Close a child/work issue only when completion evidence supports it; otherwise do not close, relabel/recommend the correct next state, and stop.\n- Default limits unless the user explicitly supplied different ones: process at most 10 child/work issues and at most one fix/review cycle per issue.\n\nLoop contract (each iteration, in order):\n1. Before starting, inspect git status. If the worktree is dirty in a way not attributable to a just-finished loop iteration, stop and report it.\n2. Resolve the target/filter into a work queue:\n   - If no explicit target/filter is supplied, query open GitHub issues labeled ready-for-agent.\n   - If the target/filter names a specific GitHub issue or issue URL, inspect that issue and its comments first. If it is a parent/PRD/container issue, discover its child issues and build the queue from those children.\n   - Treat an issue as a parent when it contains a PRD, a child/sub-issues section, a task list of issue references, explicit 'parent', 'epic', or 'container' wording, or comments/metadata from slicing that identify child issues. Prefer explicit child issue references in the parent body/comments; otherwise use GitHub sub-issue metadata when available; only then fall back to linked issues, shared milestone, or labels if the relationship is clear.\n3. Filter the queue to open, unblocked, ready-for-agent child/work issues. Order oldest first unless dependency/blocker text says otherwise. Respect blocker labels and issue text such as 'blocked by #123', task-list dependencies, and acceptance criteria dependencies.\n4. Stop when there are no unblocked ready-for-agent issues in the active queue, when the next issue is labeled needs-info/ready-for-human/wontfix or otherwise requires human review, when label state conflicts, or when all child issues for a parent target are complete. If parent-targeted auto mode completes every child, stop and report that the parent workflow can continue to the next phase; leave the parent open.\n5. Route the selected issue, then launch a fresh implementation child with a concrete contract: implement exactly that child/work issue, read selected SKILL.md guidance first, keep scope minimal, use TDD where practical, verify, and return changed files plus verification evidence.\n6. Launch a separate fresh review child against the issue, routing contract, implementation diff/commit, and verification evidence. Require file:line findings and a pass/fix/blocker outcome.\n7. If review returns small concrete fixable findings, allow the single fix pass and one follow-up review. Stop on non-trivial design questions, unclear acceptance criteria, failed verification, merge/conflict risk, or human judgment.\n8. After review passes, create the commit for that issue if there are uncommitted changes for it.\n9. Run closeout logic for that issue: post an AI-generated completion comment using the triage disclaimer, summarize changes and verification, and close only when evidence supports it.\n10. Re-check dependencies and issue state after each closeout, then continue serially with the next unblocked ready-for-agent issue until a stop rule fires.\n\nDone when the loop has stopped (self-check before finishing):\n1. A stop rule or default limit fired and the exact reason is stated.\n2. The final response contains a compact loop log: parent issue if any, child/work issues completed, commits, verification, issues skipped, and the exact blocker/stop reason.`,
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
		"  /matt-prd <issue|brief>     Write PRD / destination doc",
		"  /matt-refactors <prd|issue> Review out-of-scope grill refactors before slicing",
		"  /matt-slice <prd|issue>     Create vertical-slice issue plan and record child issues on parent issues",
		"  /matt-afk [issue|label]     Run single-issue AFK, or auto-loop when no target is supplied",
		"  /matt-auto [filter|parent]  Continuously implement, review, commit, and close ready-for-agent issues; parent issues expand to child issues",
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
			return `${phaseName}:\nUpstream Matt engineering skills:\n${skillBody}\nLocal augmentations:\n${augmentationBody}`;
		})
		.join("\n\n");
}

function statusPrompt(cwd: string, conventionsContext = buildConventionsContext(cwd)): string {
	return `${baseContext(cwd, "status", conventionsContext)}\n\nPhase: STATUS.\n\nUse applicable Matt engineering skill files above. Inspect the current repo/session state enough to summarize Matt workflow progress. Check for relevant GitHub issue references in the conversation if available, changed files, docs/features artifacts, labels, and GitHub milestone association if a target issue is obvious. If a target issue belongs to a milestone, summarize milestone-level progress without treating the milestone as the source of parent/child hierarchy: open/closed PRDs, open/closed child issues when discoverable from PRD child sections, blockers, orphan milestone issues, and whether the milestone looks close to wrap-up. Output a compact checklist across phases: intake, grill, PRD, slice, AFK, review, closeout, auto-loop, milestone/delivery-arc status, durable-doc updates. Do not implement.`;
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
		"Use applicable Matt engineering skill files above for issue tracker conventions, but remember: milestones are human-facing delivery arcs, not AFK execution units.",
		"Inspect GitHub milestones and issues with gh. If the target names a milestone, resolve it by title or number. If no target is supplied, list open milestones and ask which one to review unless there is an obvious active milestone in context.",
		"",
		"Report:",
		"- Milestone title, state, due date if any, and progress counts.",
		"- PRD/container issues in the milestone, with their discovered child issues and open/closed state.",
		"- Ready-for-agent child/work issues inside the milestone.",
		"- Issues in the milestone that are not linked to an obvious PRD/container issue.",
		"- PRDs without child issues or PRDs that appear ready for slicing.",
		"- Blockers, needs-info/ready-for-human items, and the next human decision needed to tie up the delivery arc.",
		"",
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
		"Keep it high-level unless the user asks to go deeper. Do not implement, write PRDs, create issues, or propose final interfaces.",
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
		const vendorCategoryPaths = MATT_VENDOR_CATEGORIES.map((category) => path.join(MATT_VENDOR_ROOT, category));
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

	const registerPhase = (command: string, phase: Phase, description: string, fresh = false, routeAware = false) => {
		pi.registerCommand(command, {
			description,
			getArgumentCompletions: (prefix) => {
				const suggestions = ["#", "current issue", "current diff", "active feature"];
				const filtered = suggestions.filter((item) => item.startsWith(prefix));
				return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
			},
			handler: async (args, ctx) => {
				const conventionsContext = buildConventionsContext(ctx.cwd);
				const routingContext = routeAware ? routeConfigContext(ctx.cwd) : undefined;
				const failure = combinedConfigFailure(conventionsContext, routingContext?.validation);
				if (failure) {
					ctx.ui.notify(failure, "info");
					return;
				}
				const routingAddition = routeAware ? routingAwarePromptAddition(phase, args, ctx.cwd) : undefined;
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
	registerPhase("matt-prd", "prd", "Create a PRD / destination document from resolved context");
	registerPhase("matt-refactors", "refactors", "Review out-of-scope grill refactors before slicing");
	registerPhase("matt-slice", "slice", "Break a PRD into vertical-slice issues", false, true);

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
