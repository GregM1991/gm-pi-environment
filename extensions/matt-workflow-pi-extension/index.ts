import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const MATT_ENGINEERING_SKILLS_ROOT = path.join(EXTENSION_ROOT, "vendor", "mattpocock-skills", "engineering");
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
		skill("diagnosing-bugs", "diagnosing-bugs/SKILL.md", "worker or review loops hit hard bugs or regressions"),
		skill("codebase-design", "codebase-design/SKILL.md", "review detects interface or deep-module design issues that should stop auto mode"),
		skill("improve-codebase-architecture", "improve-codebase-architecture/SKILL.md", "review detects architectural issues that should stop auto mode"),
	],
	status: [
		skill("ask-matt", "ask-matt/SKILL.md", "checking which workflow phase should happen next"),
		skill("triage", "triage/SKILL.md", "checking issue state and labels"),
	],
};

const PHASE_AUGMENTATIONS: Record<PhaseWithStatus, AugmentationRef[]> = {
	intake: [augmentation("intake", "intake.md", "local GitHub issue intake and phase recommendation policy")],
	grill: [augmentation("grill", "grill.md", "local MATT-GRILL-NOTES.md scratch document policy extracted from the previous customized grill skill")],
	prd: [augmentation("prd", "prd.md", "local milestone and grill-notes handling for PRDs")],
	refactors: [augmentation("refactors", "refactors.md", "local post-PRD refactor extraction and grill-notes deletion policy")],
	slice: [augmentation("slice", "slice.md", "local parent/child issue, milestone inheritance, and grill-notes preflight policy")],
	afk: [augmentation("afk", "afk.md", "local ready-for-agent implementation constraints")],
	review: [augmentation("review", "review.md", "local fresh-context review output and follow-up policy")],
	closeout: [augmentation("closeout", "closeout.md", "local issue closeout, PRD/container, and milestone handling policy")],
	auto: [augmentation("auto", "auto.md", "local parent orchestrator, queue, review, commit, and closeout loop policy")],
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

function docsHint(cwd: string): string {
	const workflowDoc = path.join(cwd, "docs", "agents", "matt-pocock-ai-feature-workflow.md");
	return existsSync(workflowDoc)
		? "There is an expanded repo-local workflow doc at `docs/agents/matt-pocock-ai-feature-workflow.md`; consult it only when phase guidance is insufficient."
		: "No expanded repo-local workflow doc was detected; rely on the phase engineering-skill references below.";
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
		"Phase skills are loaded into Pi from the vendored mattpocock/skills engineering folder and are also listed here with absolute paths for this phase.",
		"Use only the loaded Matt engineering skills that actually apply to this target. If a listed skill does not fit the task, skip it and briefly say why.",
		"Do not read, invoke, or reference non-engineering Matt skills or non-Matt skills. Using Pi extension tools such as subagent orchestration is allowed when the phase prompt explicitly asks for orchestration, but do not load their skill docs as workflow guidance.",
		"Relevant phase engineering skill files:",
		...refs.map((ref) => `- ${ref.name}: ${ref.absolutePath} — ${ref.useWhen}`),
	].join("\n");
}

function augmentationInstructions(phase: PhaseWithStatus): string {
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

function baseContext(cwd: string, phase: PhaseWithStatus): string {
	return [
		"You are orchestrating Matt Pocock's AI feature workflow inside pi.",
		"Keep this phase narrow. Do not jump ahead to later phases.",
		"Use repo guidance and durable artifacts instead of relying on long conversation context.",
		"Read relevant context before acting: `AGENTS.md`, `CONTEXT.md`, relevant `docs/adr/*`, relevant directory-level `AGENTS.md`, and any named GitHub issue via `gh issue view <number> --comments`.",
		"This repo uses GitHub Issues as the durable tracker and labels from `docs/agents/triage-labels.md`.",
		"This repo is Bun-first. Use Bun commands from `AGENTS.md`.",
		docsHint(cwd),
		skillInstructions(phase),
		augmentationInstructions(phase),
		architectureLensInstructions(),
	].join("\n");
}

function phasePrompt(phase: Phase, args: string, cwd: string): string {
	const target = args.trim() || "the current user request / active issue";
	const base = baseContext(cwd, phase);

	const prompts: Record<Phase, string> = {
		intake: `${base}\n\nPhase: INTAKE.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Find the source brief/issue and gather only enough repo context to decide the next workflow step. If this is a GitHub issue, inspect it and its comments. Report: source, current labels/status, missing context, recommended next phase, and whether it is human-in-loop or AFK-safe. Do not implement.`,
		grill: `${base}\n\nPhase: GRILL / ALIGNMENT.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Interview the user until there is shared understanding, using grill-with-docs when this is codebase work. Maintain a top-level repo-local \`MATT-GRILL-NOTES.md\` scratch document lazily after the first answered question or out-of-scope refactor finding: append Q&A decisions only, and update/group potential refactors that are outside the PRD scope. Do not write a PRD or implementation plan until major ambiguity is gone.`,
		prd: `${base}\n\nPhase: PRD / DESTINATION DOCUMENT.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Turn resolved context into a concise PRD/delivery brief or tracker PRD, following the selected skill. Milestones are optional human-facing delivery arcs above PRDs; they do not replace the PRD -> child issue hierarchy. If the user mentions a release, delivery arc, feature direction, or milestone, ask whether this PRD should be associated with an existing GitHub milestone or a newly confirmed milestone. Do not create a milestone unless the user explicitly asks or confirms; if creating one, use gh/GitHub after confirming the exact title and optional due date. If publishing or updating a PRD issue and the milestone is confirmed, apply it to the PRD issue and note the association in the PRD body. Use \`MATT-GRILL-NOTES.md\` if present for durable Q&A decisions, but do not include out-of-scope refactor candidates in the PRD. After the PRD is complete, recommend the formal refactor-review phase before slicing. Do not implement.`,
		refactors: `${base}\n\nPhase: POST-PRD REFACTOR EXTRACTION REVIEW.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Read the completed PRD/issue and the top-level \`MATT-GRILL-NOTES.md\` scratch document if present. Review only the potential refactors that are outside the PRD scope. Walk the user through them quickly with context, ask which should become GitHub issues, create approved issues using the repo tracker conventions and labels, then ask for explicit confirmation before deleting \`MATT-GRILL-NOTES.md\`. Do not move into slicing until the user has been prompted about deletion. Do not implement.`,
		slice: `${base}\n\nPhase: VERTICAL-SLICE ISSUE DECOMPOSITION.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Before slicing, check whether top-level \`MATT-GRILL-NOTES.md\` exists. If it exists and the user has not completed refactor extraction/deletion confirmation, stop and direct them to the post-PRD refactor extraction review. Otherwise break the PRD into independently grabbable vertical tracer-bullet issues. Avoid horizontal database/API/UI phases. Keep dependency order explicit and recommend readiness labels. If the source is an existing GitHub parent/PRD issue, inspect whether it has a milestone. If it does, child slice issues should inherit that milestone unless the user says otherwise; if milestone inheritance is unclear, ask before creating issues. If the user explicitly names a milestone for slicing, check whether it exists; ask before creating a missing milestone, then apply the confirmed milestone to the child issues. Milestones are delivery grouping only, not the source of slice hierarchy. If you create child issues from a parent/PRD issue, update the parent issue after creation with a predictable \`## Child issues\` section that lists each child issue number/link, one-line purpose, readiness label recommendation, milestone if applied, and any dependency/blocker relationship such as \`blocked by #123\`. Preserve existing parent content where possible; replace an existing generated \`## Child issues\` section instead of duplicating it. Do not implement.`,

		afk: `${base}\n\nPhase: AFK IMPLEMENTATION LOOP.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Work only on unblocked ready-for-agent issues. Start from the issue and repo docs, explore minimally, use TDD where practical, implement the smallest passing slice, and run fresh verification before claiming completion. If no unblocked ready-for-agent issue exists, stop and say so.`,
		review: `${base}\n\nPhase: FRESH-CONTEXT REVIEW.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Review from a fresh context using the issue/PRD, current diff, AGENTS.md, CONTEXT.md, and relevant ADRs as the standard. Produce file:line findings with severity and concrete fixes. Do not silently fix unless asked.`,
		closeout: `${base}\n\nPhase: ISSUE CLOSEOUT.\n\nTarget: ${target}\n\nUse the applicable Matt engineering skill files above. Close out only a specifically named issue or PRD target. Inspect the full issue with comments, current labels, milestone, acceptance criteria, current diff/commits, and fresh verification/review evidence. If the issue is a PRD/container, discover child issues from the generated child section or linked issue metadata and do not recommend closing the PRD until its child issues are complete or explicitly moved out of scope. If implementation and review evidence satisfy the issue, draft a concise completion comment that starts with the triage disclaimer required by the triage skill, summarize what changed and how it was verified, then ask for confirmation before posting or closing unless the user explicitly asked you to close it now. If the issue belongs to a milestone, report whether that milestone now appears complete, still has open PRDs/child work, or needs human cleanup; do not close the milestone unless the user explicitly asks and confirms. If evidence is missing, do not close; recommend the next state such as ready-for-agent, needs-info, or ready-for-human with the reason. Do not implement. Do not commit.`,
		auto: `${base}\n\nPhase: CONTINUOUS AFK AUTO-LOOP.\n\nTarget/filter: ${target}\n\nYou are the parent orchestrator. Use the applicable Matt engineering skill files above for issue queue state, worker contracts, review standards, and closeout decisions. If the Pi subagent extension/tooling is available, use it to launch fresh-context child agents; do not make child agents run their own subagent workflows. Do not use parallel execution or worktrees unless the user explicitly asks for it in this run.\n\nLoop contract:\n1. Before starting, inspect git status. If the worktree is dirty in a way not attributable to a just-finished loop iteration, stop and report it.\n2. Resolve the target/filter into a work queue:\n   - If no explicit target/filter is supplied, query open GitHub issues labeled ready-for-agent.\n   - If the target/filter names a specific GitHub issue or issue URL, inspect that issue and its comments first. If it is a parent/PRD/container issue, do not implement or close the parent. Instead, discover its child issues and build the queue from those children.\n   - Treat an issue as a parent when it contains a PRD, a child/sub-issues section, a task list of issue references, explicit 'parent', 'epic', or 'container' wording, or comments/metadata from slicing that identify child issues. Prefer explicit child issue references in the parent body/comments; otherwise use GitHub sub-issue metadata when available; only then fall back to linked issues, shared milestone, or labels if the relationship is clear.\n   - A milestone is not a parent issue and shared milestone membership must not be used by itself to infer PRD/child hierarchy. If the target/filter names a GitHub milestone, treat it only as a queue filter over open ready-for-agent issues in that milestone; do not implement PRD/container issues, and stop if milestone membership does not make the work relationship clear.\n   - If parent detection is ambiguous, stop and report what needs human clarification instead of implementing the parent.\n3. Filter the queue to open, unblocked, ready-for-agent child/work issues. Order oldest first unless dependency/blocker text says otherwise. Respect blocker labels and issue text such as 'blocked by #123', task-list dependencies, and acceptance criteria dependencies.\n4. Stop when there are no unblocked ready-for-agent issues in the active queue, when the next issue is labeled needs-info/ready-for-human/wontfix or otherwise requires human review, when label state conflicts, or when all child issues for a parent target are complete. If parent-targeted auto mode completes every child, stop and report that the parent workflow can continue to the next phase; do not close the parent automatically.\n5. For each selected issue, launch a fresh implementation child with a concrete contract: implement exactly that child/work issue, keep scope minimal, use TDD where practical, verify, and return changed files plus verification evidence.\n6. Launch a separate fresh review child against the issue, implementation diff/commit, and verification evidence. Require file:line findings and a pass/fix/blocker outcome.\n7. If review returns small concrete fixable findings, allow at most one worker fix pass and one follow-up review. Stop on non-trivial design questions, unclear acceptance criteria, failed verification, merge/conflict risk, or human judgment.\n8. After review passes, create one commit for that issue if there are uncommitted changes for it. Use a conventional commit message referencing the issue. Do not combine multiple issues in one commit.\n9. Run closeout logic for that issue: post an AI-generated completion comment using the triage disclaimer, summarize changes and verification, and close the child/work issue only when evidence supports it. If evidence does not support closeout, do not close; relabel/recommend the correct next state and stop.\n10. Continue serially with the next unblocked ready-for-agent issue in the active queue until a stop rule fires. Re-check dependencies and issue state after each closeout before selecting the next issue.\n\nDefault limits: process at most 10 child/work issues and at most one fix/review cycle per issue unless the user explicitly supplied a different limit. Keep a compact loop log in the final response: parent issue if any, child/work issues completed, commits, verification, issues skipped, and exact blocker/stop reason.`,
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

function statusPrompt(cwd: string): string {
	return `${baseContext(cwd, "status")}\n\nPhase: STATUS.\n\nUse applicable Matt engineering skill files above. Inspect the current repo/session state enough to summarize Matt workflow progress. Check for relevant GitHub issue references in the conversation if available, changed files, docs/features artifacts, labels, and GitHub milestone association if a target issue is obvious. If a target issue belongs to a milestone, summarize milestone-level progress without treating the milestone as the source of parent/child hierarchy: open/closed PRDs, open/closed child issues when discoverable from PRD child sections, blockers, orphan milestone issues, and whether the milestone looks close to wrap-up. Output a compact checklist across phases: intake, grill, PRD, slice, AFK, review, closeout, auto-loop, milestone/delivery-arc status, durable-doc updates. Do not implement.`;
}

function milestonePrompt(args: string, cwd: string): string {
	const target = args.trim() || "the current repo milestones / active delivery arc";
	return [
		baseContext(cwd, "status"),
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

function architectureGymPrompt(args: string, cwd: string): string {
	const target = args.trim() || "the current issue / active feature / recent workflow context";
	return [
		baseContext(cwd, "grill"),
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

function architectureLensPrompt(args: string, cwd: string): string {
	const target = args.trim() || "the current issue / active feature / recent workflow context";
	return [
		baseContext(cwd, "grill"),
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
		const skillPaths = [workflowSkillPath(), MATT_ENGINEERING_SKILLS_ROOT].filter((skillPathForPi) => existsSync(skillPathForPi));
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

	pi.registerCommand("matt-status", {
		description: "Ask the agent to summarize current workflow phase/status",
		handler: async (_args, ctx) => {
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "status", at: Date.now() });
			pi.sendUserMessage(statusPrompt(ctx.cwd));
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
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "milestone", args: args.trim(), at: Date.now() });
			pi.sendUserMessage(milestonePrompt(args, ctx.cwd));
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
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "architecture-lens", args: args.trim(), at: Date.now() });
			pi.sendUserMessage(architectureLensPrompt(args, ctx.cwd));
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
			pi.appendEntry(`${EXTENSION_NAME}:phase`, { phase: "architecture-gym", args: args.trim(), at: Date.now() });
			pi.sendUserMessage(architectureGymPrompt(args, ctx.cwd));
		},
	});

	const registerPhase = (command: string, phase: Phase, description: string, fresh = false) => {
		pi.registerCommand(command, {
			description,
			getArgumentCompletions: (prefix) => {
				const suggestions = ["#", "current issue", "current diff", "active feature"];
				const filtered = suggestions.filter((item) => item.startsWith(prefix));
				return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
			},
			handler: async (args, ctx) => {
				const prompt = phasePrompt(phase, args, ctx.cwd);
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
	registerPhase("matt-slice", "slice", "Break a PRD into vertical-slice issues");

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
			const prompt = phasePrompt(phase, trimmedArgs, ctx.cwd);
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

	registerPhase("matt-auto", "auto", "Continuously implement, review, commit, and close ready-for-agent issues");
	registerPhase("matt-review", "review", "Start a fresh-context review", true);
	registerPhase("matt-closeout", "closeout", "Verify completion evidence and close/relabel an issue");

	pi.registerCommand("matt-next", {
		description: "Choose the next Matt workflow phase interactively",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				pi.sendUserMessage(phasePrompt("intake", args, ctx.cwd));
				return;
			}

			const choice = await ctx.ui.select(
				"Choose Matt workflow phase",
				PHASES.map((phase) => `${phase} — ${phase === "afk" || phase === "review" ? "fresh context" : "current context"}`),
			);

			if (!choice) return;
			const phase = choice.split(" — ")[0] as Phase;
			const prompt = phasePrompt(phase, args, ctx.cwd);
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
