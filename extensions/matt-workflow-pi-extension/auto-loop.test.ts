import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
});

describe("command registration", () => {
	test("registers only canonical planning commands", () => {
		const names: string[] = [];
		mattWorkflowExtension({ on() {}, registerCommand(name: string) { names.push(name); } } as never);
		expect(names).toContain("matt-spec");
		expect(names).toContain("matt-tickets");
		expect(names).toContain("matt-wayfinder");
		expect(names).not.toContain("matt-prd");
		expect(names).not.toContain("matt-slice");
	});
});
