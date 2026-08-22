import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import mattWorkflowExtension, { isWayfinderPlanningIssue, phasePrompt } from "./index";

type AutoReferenceName = "auto-artifacts" | "auto-child-contracts" | "auto-review-ledger";

function autoReferencePath(name: AutoReferenceName): string {
	return path.join(import.meta.dir, "docs", "agents", `${name}.md`);
}

function readAutoReference(name: AutoReferenceName): string {
	return readFileSync(autoReferencePath(name), "utf8");
}

function withRepo(run: (cwd: string) => void): void {
	const cwd = mkdtempSync(path.join(tmpdir(), "matt-workflow-test-"));
	try { run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

async function withRepoAsync(run: (cwd: string) => Promise<void>): Promise<void> {
	const cwd = mkdtempSync(path.join(tmpdir(), "matt-workflow-test-"));
	try { await run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("planning phase contracts", () => {
	test("grill exposes its wrapper and required grilling primitive while refactors retain architecture guidance", () => withRepo((cwd) => {
		const grill = phasePrompt("grill", "#1", cwd);
		const refactors = phasePrompt("refactors", "#1", cwd);
		expect(grill).toContain("engineering/grill-with-docs/SKILL.md");
		expect(grill).toContain("productivity/grilling/SKILL.md");
		expect(grill).toContain("engineering/improve-codebase-architecture/SKILL.md");
		expect(refactors).toContain("engineering/improve-codebase-architecture/SKILL.md");
	}));

	test("spec uses current upstream skill and preserves local gates", () => withRepo((cwd) => {
		const prompt = phasePrompt("spec", "#1", cwd);
		const milestoneReference = path.join(import.meta.dir, "docs", "agents", "milestones.md");
		expect(prompt).toContain("engineering/to-spec/SKILL.md");
		expect(prompt).toContain("confirm proposed test seams");
		expect(prompt).toContain(`If milestone association is requested or considered, read ${milestoneReference} before associating the spec`);
		expect(prompt).toContain("/matt-refactors");
		expect(prompt).toContain("/matt-tickets");
	}));

	test("tickets uses blocking edges, parent-index augmentation, and routing hints", () => withRepo((cwd) => {
		const prompt = phasePrompt("tickets", "#1", cwd, "Issue-aware skill routing for ticket creation:");
		const milestoneReference = path.join(import.meta.dir, "docs", "agents", "milestones.md");
		expect(prompt).toContain("engineering/to-tickets/SKILL.md");
		expect(prompt).toContain("native blocking relationships");
		expect(prompt).toContain("generated ## Child issues section");
		expect(prompt).toContain("MATT-GRILL-NOTES.md");
		expect(prompt).toContain("Issue-aware skill routing for ticket creation");
		expect(prompt).toContain(`If the source spec has a milestone or inheritance is considered, read ${milestoneReference} before creating child issues`);
	}));

	test("wayfinder stays planning-only, preserves HITL, and hands off to spec", () => withRepo((cwd) => {
		const prompt = phasePrompt("wayfinder", "large destination", cwd);
		expect(prompt).toContain("engineering/wayfinder/SKILL.md");
		expect(prompt).toContain("productivity/grilling/SKILL.md");
		expect(prompt).toContain("never implement destination work");
		expect(prompt).toContain("HITL grilling and prototype tickets require the live user");
		expect(prompt).toContain("/matt-spec");
		expect(prompt).toContain("resolves exactly one decision ticket per session");
		expect(prompt).toContain("research ticket may use parallel research subagents");
	}));
});

describe("Wayfinder automation boundaries", () => {
	test("auto keeps orchestration visible while disclosing mechanics through focused step-local references", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const artifactReference = autoReferencePath("auto-artifacts");
		const childReference = autoReferencePath("auto-child-contracts");
		const ledgerReference = autoReferencePath("auto-review-ledger");
		const artifacts = readAutoReference("auto-artifacts");
		const children = readAutoReference("auto-child-contracts");
		const ledger = readAutoReference("auto-review-ledger");

		expect(auto).toContain("Phase: CONTINUOUS AFK AUTO-LOOP");
		expect(auto).toContain("Loop contract (each iteration, in order)");
		expect(auto).toContain("Never implement or close a parent/spec/container issue");
		expect(auto).toContain("at most three fix/review cycles per issue");
		expect(auto).toContain("11. Run closeout only after confirmed publication:");
		expect(auto).toContain("compact loop log");
		expect(auto.indexOf(artifactReference)).toBeGreaterThan(auto.indexOf("5. Route the selected issue"));
		expect(auto.indexOf(childReference)).toBeGreaterThan(auto.indexOf("6. Launch a fresh implementation child"));
		expect(auto.indexOf(ledgerReference)).toBeGreaterThan(auto.indexOf("7. Launch a separate fresh review child"));
		expect(auto.length).toBeLessThanOrEqual(13_000);

		expect(artifacts).toContain("canonical `owner/name` from the normalized `origin` URL");
		expect(artifacts).toContain("mode `0700`");
		expect(artifacts).toContain("mode `0600`");
		expect(artifacts).toContain("Verification invalidation");
		expect(artifacts).toContain("On every loop termination path");
		expect(children).toContain("Implementation child");
		expect(children).toContain("Fix child");
		expect(children).toContain("Review child");
		expect(children).toContain("Agreed Seam");
		expect(children).toContain("stop and return a human-decision blocker");
		expect(ledger).toContain("bun run review-ledger:append -- --describe");
		expect(ledger).toContain("The executable schema owns record fields, closed taxonomies, and structural relationships");

		expect(auto).not.toContain("UTF-8 encode that identity, base64url encode it without padding");
		expect(auto).not.toContain("Normalize summary and evidence with Unicode NFKC");
		expect(auto).not.toContain("The three stage forms are `<issue>-initial.log`");
	}));

	test("unattended review and auto phase packs exclude child-orchestrating architecture guidance", () => withRepo((cwd) => {
		const review = phasePrompt("review", "#42", cwd);
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(review).not.toContain("improve-codebase-architecture/SKILL.md");
		expect(auto).not.toContain("improve-codebase-architecture/SKILL.md");
	}));

	test("classifies every Wayfinder label case-insensitively", () => {
		for (const label of ["wayfinder:map", "wayfinder:research", "wayfinder:prototype", "wayfinder:grilling", "wayfinder:task", "WayFinder:Research"]) {
			expect(isWayfinderPlanningIssue({ labels: [label] })).toBe(true);
		}
		expect(isWayfinderPlanningIssue({ labels: ["ready-for-agent", "bug"] })).toBe(false);
	});

	test("AFK and auto prompts exclude maps and decision tickets", () => withRepo((cwd) => {
		const afk = phasePrompt("afk", "ready-for-agent", cwd);
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const children = readAutoReference("auto-child-contracts");
		expect(afk).toContain("wayfinder:map or wayfinder:*");
		expect(auto).toContain("must be re-checked after every queue refresh");
		expect(auto).toContain("at most three fix/review cycles per issue");
		expect(auto).toContain("A concrete repo-local FIX or BLOCKER launches a Fix child");
		expect(auto).toContain("Parent Orchestrator exclusively owns review launches");
		expect(auto).toContain("builtin `worker` children for implementation/fixes");
		expect(auto).toContain("builtin `reviewer` children for review");
		expect(auto).toContain('context: "fresh"');
		expect(children).toContain("Review, commit, tracker mutation, and further agent launches remain Parent Orchestrator work");
	}));

	test("auto and closeout point to canonical milestone rules at filtering and reporting branches", () => withRepo((cwd) => {
		const milestoneReference = path.join(import.meta.dir, "docs", "agents", "milestones.md");
		const auto = phasePrompt("auto", "current milestone", cwd);
		const closeout = phasePrompt("closeout", "#42", cwd);
		expect(auto).toContain(`If the target/filter or selected issue involves a Milestone, read ${milestoneReference} before filtering or reporting`);
		expect(auto).not.toContain("fall back to linked issues, shared milestone");
		expect(closeout).toContain(`If the issue belongs to a milestone or milestone closeout is considered, read ${milestoneReference} before reporting or mutating milestone state`);
		expect(closeout).not.toContain("its state was reported: complete, still has open specs/child work, or needs human cleanup");
	}));

	test("auto orchestrator waits for running children without polling or mid-child inspection", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(auto).toContain("Never poll or inspect repo state while a child is running");
		expect(auto).toContain("Wait for its returned result");
		expect(auto).toContain("known-long verification attention notice means keep waiting");
		expect(auto).toContain("unless the harness reports failure or a stall");
		expect(auto).toContain("Wait for its diff and compact verification handoff, then inspect the returned diff and evidence");
	}));

	test("auto prepares an external per-issue packet for every child contract", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const artifactReference = autoReferencePath("auto-artifacts");
		const childReference = autoReferencePath("auto-child-contracts");
		const artifacts = readAutoReference("auto-artifacts");
		const children = readAutoReference("auto-child-contracts");

		expect(auto).toContain(`Read ${artifactReference} now, then create its private review packet`);
		expect(auto).toContain(`Read ${childReference} now`);
		expect(artifacts).toContain("${TMPDIR:-/tmp}/matt-auto-review-packets/<repo-id>/<issue>.md");
		expect(artifacts).toContain("the fetched issue body and acceptance criteria");
		expect(artifacts).toContain("the parent/spec reference");
		expect(artifacts).toContain("the routing contract and selected skill pack");
		expect(artifacts).toContain("relevant `AGENTS.md`, `CONTEXT.md`, ADR, and durable-document references");
		expect(artifacts).toContain("commands and paths for the current diff");
		expect(artifacts).toContain("compact verification summary, failing cases, and verification log path");
		expect(children).toContain("Supply the absolute per-issue review-packet path");
		expect(children).toContain("independently inspects the issue, actual code, and current diff");
		expect(artifacts).toContain("canonical `owner/name` from the normalized `origin` URL");
		expect(artifacts).toContain("UTF-8 encode that identity, base64url encode it without padding");
		expect(artifacts).toContain("prefix it with `gh-` or `path-` respectively");
		expect(artifacts).toContain("mode `0700`");
		expect(artifacts).toContain("mode `0600`");
		expect(artifacts).toContain("never stage or commit it");
		expect(artifacts).toContain("exclude it from dirty-worktree handling");
		expect(artifacts).toContain("On every loop termination path");
	}));

	test("auto worker and fix contracts keep full verification logs out of handoffs", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const artifactReference = autoReferencePath("auto-artifacts");
		const artifacts = readAutoReference("auto-artifacts");
		const children = readAutoReference("auto-child-contracts");

		expect(auto).toContain(`use the verification-invalidation rules in ${artifactReference}`);
		expect(artifacts).toContain("`.pi/matt-verification/<issue>-<stage>.log`");
		expect(artifacts).toContain("`<issue>-initial.log`, `<issue>-fix-<n>.log`, and `<issue>-pre-push.log`");
		expect(artifacts).not.toContain("<issue>-pre-commit.log");
		expect(artifacts).toContain("repo-local `.git/info/exclude`");
		expect(artifacts).toContain("mode `0700`");
		expect(artifacts).toContain("mode `0600`");
		expect(artifacts).toContain("pass/fail summary, failing cases, and log path");
		expect(children).toContain("Use focused tests while editing");
		expect(children).toContain("run one complete repo check");
		expect(children).toContain("The handoff contains no raw verification output");
		expect(artifacts).toContain("After successful issue closeout, delete that issue's packet and logs");
		expect(artifacts).toContain("On every loop termination path");
	}));

	test("auto sequences a completed full check through review bookkeeping to commit without duplication", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const artifacts = readAutoReference("auto-artifacts");
		const implementation = auto.indexOf("6. Launch a fresh implementation child");
		const review = auto.indexOf("7. Launch a separate fresh review child");
		const commit = auto.indexOf("9. After review passes");
		expect(implementation).toBeGreaterThan(-1);
		expect(implementation).toBeLessThan(review);
		expect(review).toBeLessThan(commit);
		expect(auto).toContain("Rerun only when invalidated");
		expect(auto).toContain("never commit on a failing check");
		expect(auto).toContain("A failed rerun re-enters the fix/review cycle while budget remains");
		expect(auto).toContain("otherwise stop as budget exhausted");
		expect(artifacts).toContain("That check remains valid for commit preparation while code and verification-relevant inputs are unchanged");
		expect(artifacts).toContain("Review results, ledger appends, compact summaries, packet updates, and log bookkeeping do not invalidate it");
		expect(artifacts).toContain("Never require two identical consecutive orchestrator-run complete checks");
	}));

	test("auto publishes a hook-verified final commit before closeout without bypass", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const commit = auto.indexOf("9. After review passes");
		const publication = auto.indexOf("10. Publish the final issue commit");
		const closeout = auto.indexOf("11. Run closeout only after confirmed publication:");

		expect(commit).toBeGreaterThan(-1);
		expect(commit).toBeLessThan(publication);
		expect(publication).toBeLessThan(closeout);
		expect(auto).toContain("Never use `git push --no-verify`, `git commit --no-verify`, or any equivalent hook bypass");
		expect(auto).toContain("A failed pre-push hook blocks closeout");
		expect(auto).toContain("re-enters the fix/review/commit cycle while budget remains");
		expect(auto).toContain("a later fix must be committed and pushed again");
		expect(auto).toContain("stage only issue-owned paths plus issue-owned ledger evidence");
		expect(auto).toContain("stop on ambiguous staged, tracked, or relevant untracked changes");
		expect(auto).toContain("or push/PR publication fails, preserve the local commit and leave the issue open");
		expect(auto).toContain("normal push whose pre-push hook passed");
		expect(auto).toContain("pushed final commit or its pull request");
	}));

	test("auto prompt points to the append-only Review Ledger lifecycle owner", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const ledgerReference = autoReferencePath("auto-review-ledger");
		const ledger = readAutoReference("auto-review-ledger");

		expect(auto).toContain(ledgerReference);
		expect(auto).toContain("complete its validating append, recurrence, prevention, and stop-rule mechanics");
		expect(auto).toContain("Review Ledger appends in the same commit");
		expect(auto).toContain("Review Ledger records appended per source and issue");
		expect(auto).toContain("`Guidance-promotion candidates`");
		expect(ledger).toContain("bun run review-ledger:append -- --describe");
		expect(ledger).toContain("--repo-root <target-repo-root>");
		expect(ledger).toContain("never work around it by writing, echoing, or editing a JSONL line directly");
		expect(ledger).toContain("Unversioned records are legacy");
		expect(ledger).toContain("Every newly appended record uses `schemaVersion: 2`");
		expect(ledger).toContain("`repeatsFindingId`");
		expect(ledger).toContain("`repeatsLegacyLine`");
		expect(ledger).not.toContain("reviewedCommitSha");
		expect(ledger).toContain("## Recurring-class identity");
		expect(ledger).toContain("persist the class's existing key in `recurringClassKey`");
		expect(ledger).toContain("Only a genuinely new recurring class derives a fresh deterministic key");
		expect(ledger).toContain("embed and search for it verbatim in the prevention issue body");
		expect(ledger).toContain("file or reuse the human-triage prevention issue");
		expect(ledger).toContain("stop only when the same class recurs later in the run after injection");
	}));
	test("configured AI gate has a separate source-tagged ledger lifecycle", () => withRepo((cwd) => {
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		writeFileSync(path.join(cwd, ".pi", "matt-conventions.json"), JSON.stringify({
			version: 1,
			toolchain: { runtime: "bun", commands: { aiGate: "bun run ai-gate" } },
		}));

		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const ledgerReference = autoReferencePath("auto-review-ledger");
		const ledger = readAutoReference("auto-review-ledger");
		const artifacts = readAutoReference("auto-artifacts");
		const commit = auto.indexOf("9. After review passes");
		const gate = auto.indexOf("9a. Before publication");
		const publication = auto.indexOf("10. Publish the final issue commit");
		const closeout = auto.indexOf("11. Run closeout only after confirmed publication:");

		expect(auto).toContain(`read ${ledgerReference}, then run the configured AI gate exactly once for this issue after its commit exists`);
		expect(auto).toContain("Append its source-tagged outcome and update the same issue commit");
		expect(auto).toContain("FIX or a concrete remediable BLOCKER enters a fix-worker plus fresh-review cycle while budget remains");
		expect(auto).toContain("never rerun the gate");
		expect(auto).toContain("without bypassing hooks");
		expect(auto).toContain("If HEAD moved or unrelated work makes updating the commit unsafe");
		expect(auto).toContain("exhausted three-cycle budget stops without closing");
		expect(commit).toBeGreaterThan(-1);
		expect(commit).toBeLessThan(gate);
		expect(gate).toBeLessThan(publication);
		expect(publication).toBeLessThan(closeout);

		expect(ledger).toContain("run it exactly once per issue");
		expect(ledger).toContain("after the issue's review has passed and its commit exists, but before publication and closeout");
		expect(ledger).toContain("Do not run it after review children");
		expect(ledger).toContain('source: "ai-gate"');
		expect(ledger).toContain("no findings → `PASS`");
		expect(ledger).toContain("actionable must-fix or should-fix findings → `FIX`");
		expect(ledger).toContain("execution/parsing failure or a non-remediable blocking result → `BLOCKER`");
		expect(ledger).toContain("committed issue diff");
		expect(ledger).toContain("Classify each novel gate finding's `repeat` value under the v2 finding-record rules");
		expect(ledger).toContain('Any novel AI-gate finding classified `repeat: "earlier-issue"` enters exactly the same recurring-class machinery');
		expect(ledger).toContain("triggers a fix worker and fresh review while fewer than three fix/review cycles have been used");
		expect(ledger).toContain("If all three cycles have already been consumed, stop with the budget-exhausted reason");
		expect(ledger).toContain("Do not run the gate again after that review");
		expect(ledger).toContain("Normalize summary and evidence with Unicode NFKC");
		expect(artifacts).toContain("Review results, ledger appends, compact summaries, packet updates, and log bookkeeping do not invalidate it");
	}));
	test("fresh review keeps its configured AI gate behavior", () => withRepo((cwd) => {
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		writeFileSync(path.join(cwd, ".pi", "matt-conventions.json"), JSON.stringify({
			version: 1,
			toolchain: { runtime: "bun", commands: { aiGate: "bun run ai-gate" } },
		}));

		const review = phasePrompt("review", "#42", cwd);
		expect(review).toContain("Run the repo AI gate as part of this review");
		expect(review).toContain("The AI gate command was executed");
		expect(review).not.toContain("exactly once for that issue");
	}));

	test("v2 verdict-only PASS records include run identity and worker provenance but omit finding fields", () => {
		const ledger = readAutoReference("auto-review-ledger");
		const passSection = ledger.split("## V2 verdict-only PASS record")[1] ?? "";
		const example = passSection.match(/```json\n(.+)\n```/)?.[1];

		expect(passSection).toContain("`workerSkillPack` is required");
		expect(passSection).toContain("finding-only and repeat-provenance fields are omitted");
		expect(example).toBeDefined();
		expect(JSON.parse(example ?? "{}")).toEqual({
			schemaVersion: 2,
			date: "2026-02-24T16:40:00.000Z",
			issue: 42,
			cycle: "fix-2",
			verdict: "PASS",
			source: "review-child",
			runId: "62bef605-bd95-49a4-aec3-d70e01bb3d8a",
			workerSkillPack: ["implement", "tdd"],
		});
	});
});

describe("retro phase contract", () => {
	test("requires validated evidence, distinct repeat signals, and per-proposal approval", () => withRepo((cwd) => {
		const prompt = phasePrompt("retro", "", cwd);
		expect(prompt).toContain(`schema-generated contract and semantics in ${autoReferencePath("auto-review-ledger")}`);
		expect(prompt).toContain("augmentations/retro.md");
		expect(prompt).toContain(".pi/matt-review-ledger.jsonl");
		expect(prompt).toContain("missing, empty, or malformed");
		expect(prompt).toContain("report every malformed line with its line number");
		expect(prompt).not.toContain("malformed line numbers");
		expect(prompt).toContain("within one issue");
		expect(prompt).toContain("across issues");
		expect(prompt).toContain("source-less legacy records as `review-child`");
		expect(prompt).toContain("separately for `review-child` and `ai-gate`");
		expect(prompt).toContain("issue/cycle references");
		expect(prompt).toContain("Give cross-issue clusters explicit priority");
		expect(prompt).toContain("propose a prevention tier for every cross-issue cluster");
		expect(prompt).toContain("Prefer a deterministic target-repo toolchain check when feasible");
		expect(prompt).toContain("target-repo deterministic toolchain checks");
		expect(prompt).toContain("explicit per-proposal approval");
		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "retro.md"), "utf8");
		expect(augmentation).toContain("Accept both unversioned legacy records and `schemaVersion: 2` records");
		expect(augmentation).toContain("including mixed ledgers");
		expect(augmentation).toContain("Validate finding UUID uniqueness across the ledger");
		expect(augmentation).toContain("Give cross-issue clusters explicit priority");
		expect(augmentation).toContain("Prevention tier for every across-issue proposal");
		expect(augmentation).toContain("deterministic target-repo check, target-repo guidance, or routed skill");
		expect(prompt).toContain("applied and skipped");
		expect(prompt).toContain("Never rewrite, compact, or modify the ledger");
		expect(prompt).toContain("vendor/mattpocock-skills");
		expect(prompt).not.toContain("Architecture learning lens");
		expect(prompt).not.toContain("improve-codebase-architecture/SKILL.md");
		expect(prompt).not.toContain("Target:");
	}));
});

describe("resource discovery", () => {
	test("registers only the local workflow router and promoted vendor categories", async () => {
		type ResourceResult = { skillPaths: string[] } | undefined;
		let discover: (() => Promise<ResourceResult>) | undefined;
		mattWorkflowExtension({
			on(event: string, handler: () => Promise<ResourceResult>) {
				if (event === "resources_discover") discover = handler;
			},
			registerCommand() {},
		} as never);

		const resources = await discover?.();
		expect(resources?.skillPaths).toEqual([
			path.join(import.meta.dir, "skills"),
			path.join(import.meta.dir, "vendor", "mattpocock-skills", "engineering"),
			path.join(import.meta.dir, "vendor", "mattpocock-skills", "productivity"),
		]);
	});
});

describe("command registration", () => {
	test("describes verified publication in auto command and help surfaces", async () => {
		type RegisteredCommand = {
			description: string;
			handler: (args: string, ctx: { ui: { notify: (message: string) => void } }) => Promise<void>;
		};
		let auto: RegisteredCommand | undefined;
		let help: RegisteredCommand | undefined;
		const messages: string[] = [];
		mattWorkflowExtension({
			on() {},
			registerCommand(name: string, command: RegisteredCommand) {
				if (name === "matt-auto") auto = command;
				if (name === "matt-help") help = command;
			},
		} as never);

		await help?.handler("", { ui: { notify(message: string) { messages.push(message); } } });

		expect(auto?.description).toContain("implement, review, commit, publish, and close");
		expect(messages[0]).toContain("implement, review, commit, publish, and close");
	});

	test("always-discovered router contains only universal invariants and precise Phase-reference guidance", () => withRepo((cwd) => {
		const router = readFileSync(path.join(import.meta.dir, "skills", "matt-workflow", "SKILL.md"), "utf8");
		const grill = phasePrompt("grill", "#42", cwd);
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const milestone = readFileSync(path.join(import.meta.dir, "docs", "agents", "milestones.md"), "utf8");

		expect(router).toContain("The generated Phase message is the active workflow Interface");
		expect(router).toContain("follow each branch-triggered Augmentation and Agent Reference pointer");
		expect(router).toContain("Local Augmentations override conflicting upstream skill guidance");
		expect(router).toContain("Tracker mutations are Phase actions");
		expect(router).not.toContain("MATT-GRILL-NOTES.md");
		expect(router).not.toContain("three fix/review cycles");
		expect(router).not.toContain("wayfinder:map");
		expect(router).not.toContain("## Architecture learning lens");
		expect(router).not.toContain(".pi/matt-skill-routes.json");
		expect(router).not.toContain("Milestone = strategic delivery arc");

		expect(grill).toContain("MATT-GRILL-NOTES.md");
		expect(auto).toContain(autoReferencePath("auto-artifacts"));
		expect(auto).toContain(autoReferencePath("auto-child-contracts"));
		expect(auto).toContain(autoReferencePath("auto-review-ledger"));
		expect(milestone).toContain("Milestone = strategic delivery arc");
	}));

	test("status and milestone-review commands point to canonical reporting rules", async () => withRepoAsync(async (cwd) => {
		type RegisteredCommand = { handler: (args: string, ctx: { cwd: string; ui: { notify: (message: string) => void } }) => Promise<void> };
		let status: RegisteredCommand | undefined;
		let milestone: RegisteredCommand | undefined;
		const messages: string[] = [];
		mattWorkflowExtension({
			on() {},
			appendEntry() {},
			sendUserMessage(message: string) { messages.push(message); },
			registerCommand(name: string, command: RegisteredCommand) {
				if (name === "matt-status") status = command;
				if (name === "matt-milestone") milestone = command;
			},
		} as never);

		await status?.handler("", { cwd, ui: { notify() {} } });
		await milestone?.handler("current milestone", { cwd, ui: { notify() {} } });
		const milestoneReference = path.join(import.meta.dir, "docs", "agents", "milestones.md");
		expect(messages[0]).toContain(`If the status target belongs to a milestone, read ${milestoneReference} before reporting milestone progress`);
		expect(messages[1]).toContain(`Read ${milestoneReference} before inspecting or reporting this milestone`);
	}));

	test("keeps detailed milestone policy in the canonical agent reference", () => {
		const canonical = readFileSync(path.join(import.meta.dir, "docs", "agents", "milestones.md"), "utf8");
		expect(canonical).toContain("## Conceptual hierarchy");
		expect(canonical).toContain("## Child issue inheritance");
		expect(canonical).toContain("## Auto mode");
		expect(canonical).toContain("## Milestone review");
		expect(canonical).toContain("## Mutations and closeout");

		for (const relativePath of ["skills/matt-workflow/SKILL.md", "augmentations/status.md", "README.md"]) {
			const content = readFileSync(path.join(import.meta.dir, relativePath), "utf8");
			expect(content).not.toContain("Milestone = strategic delivery arc");
			expect(content).not.toContain("## Child issue inheritance");
		}
		const phaseSource = readFileSync(path.join(import.meta.dir, "index.ts"), "utf8");
		expect(phaseSource).not.toContain("A milestone target/filter is only a queue filter over open ready-for-agent issues");
	});

	test("registers canonical planning and insight commands", () => {
		const names: string[] = [];
		mattWorkflowExtension({ on() {}, registerCommand(name: string) { names.push(name); } } as never);
		expect(names).toContain("matt-spec");
		expect(names).toContain("matt-tickets");
		expect(names).toContain("matt-wayfinder");
		expect(names).toContain("matt-retro");
		expect(names).not.toContain("matt-prd");
		expect(names).not.toContain("matt-slice");
	});

	test("retro is ledger-wide and offers no issue-target completions", () => {
		type RegisteredCommand = { getArgumentCompletions?: (prefix: string) => unknown };
		let retro: RegisteredCommand | undefined;
		let spec: RegisteredCommand | undefined;
		mattWorkflowExtension({
			on() {},
			registerCommand(name: string, command: RegisteredCommand) {
				if (name === "matt-retro") retro = command;
				if (name === "matt-spec") spec = command;
			},
		} as never);

		expect(retro?.getArgumentCompletions).toBeUndefined();
		expect(spec?.getArgumentCompletions).toBeFunction();
	});

	test("includes retro in the matt-profile summary", async () => {
		let profile: { handler: (args: string, ctx: unknown) => Promise<void> } | undefined;
		mattWorkflowExtension({
			on() {},
			registerCommand(name: string, command: typeof profile) { if (name === "matt-profile") profile = command; },
		} as never);
		let summary = "";
		await profile?.handler("", { ui: { notify(message: string) { summary = message; } } });
		expect(summary).toContain("/matt-retro");
	});
});
