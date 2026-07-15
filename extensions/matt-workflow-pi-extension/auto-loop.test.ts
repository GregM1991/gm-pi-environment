import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import mattWorkflowExtension, { isWayfinderPlanningIssue, phasePrompt } from "./index";

function withRepo(run: (cwd: string) => void): void {
	const cwd = mkdtempSync(path.join(tmpdir(), "matt-workflow-test-"));
	try { run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("planning phase contracts", () => {
	test("spec uses current upstream skill and preserves local gates", () => withRepo((cwd) => {
		const prompt = phasePrompt("spec", "#1", cwd);
		expect(prompt).toContain("engineering/to-spec/SKILL.md");
		expect(prompt).toContain("confirm proposed test seams");
		expect(prompt).toContain("milestone");
		expect(prompt).toContain("/matt-refactors");
		expect(prompt).toContain("/matt-tickets");
	}));

	test("tickets uses blocking edges, parent-index augmentation, and routing hints", () => withRepo((cwd) => {
		const prompt = phasePrompt("tickets", "#1", cwd, "Issue-aware skill routing for ticket creation:");
		expect(prompt).toContain("engineering/to-tickets/SKILL.md");
		expect(prompt).toContain("native blocking relationships");
		expect(prompt).toContain("generated ## Child issues section");
		expect(prompt).toContain("MATT-GRILL-NOTES.md");
		expect(prompt).toContain("Issue-aware skill routing for ticket creation");
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
	test("classifies every Wayfinder label case-insensitively", () => {
		for (const label of ["wayfinder:map", "wayfinder:research", "wayfinder:prototype", "wayfinder:grilling", "wayfinder:task", "WayFinder:Research"]) {
			expect(isWayfinderPlanningIssue({ labels: [label] })).toBe(true);
		}
		expect(isWayfinderPlanningIssue({ labels: ["ready-for-agent", "bug"] })).toBe(false);
	});

	test("AFK and auto prompts exclude maps and decision tickets", () => withRepo((cwd) => {
		const afk = phasePrompt("afk", "ready-for-agent", cwd);
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(afk).toContain("wayfinder:map or wayfinder:*");
		expect(auto).toContain("Re-check Wayfinder classification after every queue refresh");
		expect(auto).toContain("at most three fix/review cycles per issue");
		expect(auto).toContain("must continue while fewer than three fix/review cycles have been used");
		expect(auto).toContain("parent orchestrator exclusively owns review launches");
		expect(auto).toContain("builtin `worker` agent for implementation and fix children");
		expect(auto).toContain("builtin `reviewer` agent for review children");
		expect(auto).toContain('context: "fresh"');
		expect(auto).toContain("not to review, commit, close issues, or launch subagents");
	}));

	test("auto prompt carries the append-only review ledger lifecycle contract", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(auto).toContain("augmentations/auto.md");
		expect(auto).toContain(".pi/matt-review-ledger.jsonl");
		expect(auto).toContain("append-only");
		expect(auto).toContain("closed category taxonomy");
		expect(auto).toContain("exactly as documented in `augmentations/auto.md`");
		expect(auto).not.toContain("Require file:line findings, severity, one-line summaries");
		expect(auto).toContain("same issue commit");
		expect(auto).toContain("ledger records appended per issue");
	}));

	test("verdict-only PASS records omit every finding field, including the worker skill pack", () => {
		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "auto.md"), "utf8");
		const passSection = augmentation.split("## Verdict-only PASS record")[1] ?? "";
		const example = passSection.match(/```json\n(.+)\n```/)?.[1];

		expect(passSection).toContain("It contains only `date`, `issue`, `cycle`, and `verdict`");
		expect(passSection).toContain("`workerSkillPack`");
		expect(example).toBeDefined();
		expect(JSON.parse(example ?? "{}")).toEqual({
			date: "2026-02-24T16:40:00.000Z",
			issue: 42,
			cycle: "fix-2",
			verdict: "PASS",
		});
	});
});

describe("retro phase contract", () => {
	test("requires validated evidence, distinct repeat signals, and per-proposal approval", () => withRepo((cwd) => {
		const prompt = phasePrompt("retro", "", cwd);
		expect(prompt).toContain(`- auto: ${path.join(import.meta.dir, "augmentations", "auto.md")} —`);
		expect(prompt).toContain("augmentations/retro.md");
		expect(prompt).toContain(".pi/matt-review-ledger.jsonl");
		expect(prompt).toContain("missing, empty, or malformed");
		expect(prompt).toContain("report every malformed line with its line number");
		expect(prompt).not.toContain("malformed line numbers");
		expect(prompt).toContain("within one issue");
		expect(prompt).toContain("across issues");
		expect(prompt).toContain("issue/cycle references");
		expect(prompt).toContain("explicit per-proposal approval");
		expect(prompt).toContain("applied and skipped");
		expect(prompt).toContain("Never rewrite, compact, or modify the ledger");
		expect(prompt).toContain("vendor/mattpocock-skills");
		expect(prompt).not.toContain("Architecture learning lens");
		expect(prompt).not.toContain("improve-codebase-architecture/SKILL.md");
		expect(prompt).not.toContain("Target:");
	}));
});

describe("command registration", () => {
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
