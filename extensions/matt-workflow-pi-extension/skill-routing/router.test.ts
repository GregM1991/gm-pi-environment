import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRoutingContext, scaffoldSkillRoutesJson } from "./config";
import { formatDryRun, formatRoutingPromptContract, formatTicketSkillHintInstructions } from "./format";
import { routeIssue } from "./router";

let repoRoot = "";
let extensionRoot = "";

function writeSkill(root: string, relativePath: string): void {
	const target = path.join(root, relativePath);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, "# Skill\n", "utf8");
}

function writeDefaults(): void {
	for (const skillId of ["implement", "tdd", "code-review", "diagnosing-bugs", "codebase-design", "improve-codebase-architecture"]) {
		writeSkill(extensionRoot, path.join("vendor", "mattpocock-skills", "engineering", skillId, "SKILL.md"));
	}
	for (const skillId of ["accessibility", "react-performance-guidelines", "testing-philosophy", "observability", "security-review"]) {
		writeSkill(path.resolve(extensionRoot, "..", "..", "skills"), path.join(skillId, "SKILL.md"));
	}
}

beforeEach(() => {
	const root = mkdtempSync(path.join(tmpdir(), "matt-routing-test-"));
	repoRoot = path.join(root, "repo");
	extensionRoot = path.join(root, "env", "extensions", "matt-workflow-pi-extension");
	mkdirSync(repoRoot, { recursive: true });
	writeDefaults();
});

afterEach(() => {
	if (repoRoot) rmSync(path.dirname(repoRoot), { recursive: true, force: true });
});

describe("skill routing config", () => {
	test("scaffold JSON contains strict versioned top-level sections and positive limits", () => {
		const scaffold = JSON.parse(scaffoldSkillRoutesJson());
		expect(scaffold.version).toBe(1);
		expect(scaffold.limits.workerMaxRoutedSkills).toBeGreaterThan(0);
		expect(scaffold.limits.reviewMaxRoutedSkills).toBeGreaterThan(0);
		expect(scaffold.skills).toEqual([]);
		expect(scaffold.routes).toEqual([]);
		expect(scaffold.disabledRoutes).toEqual([]);
		expect(scaffold.disabledSkills).toEqual([]);
	});

	test("rejects zero limits and non-repo skill resolvers in repo config", () => {
		mkdirSync(path.join(repoRoot, ".pi"), { recursive: true });
		writeFileSync(
			path.join(repoRoot, ".pi", "matt-skill-routes.json"),
			JSON.stringify({
				version: 1,
				limits: { workerMaxRoutedSkills: 0 },
				skills: [{ id: "bad", compatibility: ["worker"], safety: "allowlisted", resolver: { type: "workspace", relativePath: "bad/SKILL.md" } }],
				routes: [],
			}),
			"utf8",
		);
		const context = buildRoutingContext(repoRoot, extensionRoot);
		expect(context.validation.ok).toBe(false);
		expect(context.validation.diagnostics.map((item) => item.code)).toContain("invalid-limit");
		expect(context.validation.diagnostics.map((item) => item.code)).toContain("invalid-repo-skill-resolver");
	});

	test("rejects empty route skill and evidence arrays as a hard stop", () => {
		mkdirSync(path.join(repoRoot, ".pi"), { recursive: true });
		writeFileSync(
			path.join(repoRoot, ".pi", "matt-skill-routes.json"),
			JSON.stringify({
				version: 1,
				routes: [
					{ id: "empty-skills", skillIds: [], rationale: "No selected skills", labels: ["bug"] },
					{ id: "empty-labels", skillIds: ["diagnosing-bugs"], rationale: "No label evidence", labels: [] },
					{ id: "empty-title", skillIds: ["diagnosing-bugs"], rationale: "No title evidence", title: [] },
					{ id: "empty-body", skillIds: ["diagnosing-bugs"], rationale: "No body evidence", body: [] },
					{ id: "empty-paths", skillIds: ["diagnosing-bugs"], rationale: "No path evidence", paths: [] },
					{ id: "no-matchers", skillIds: ["diagnosing-bugs"], rationale: "No evidence fields" },
				],
			}),
			"utf8",
		);
		const context = buildRoutingContext(repoRoot, extensionRoot);
		const diagnostics = context.validation.diagnostics;
		expect(context.validation.ok).toBe(false);
		expect(diagnostics.map((item) => item.code)).toContain("invalid-route-skills");
		expect(diagnostics.filter((item) => item.code === "invalid-route-match").map((item) => item.path)).toEqual([
			"routes[1].labels",
			"routes[2].title",
			"routes[3].body",
			"routes[4].paths",
		]);
		expect(diagnostics.some((item) => item.code === "missing-route-match" && item.path === "routes[5]")).toBe(true);
	});
});

describe("skill routing formatters", () => {
	test("formats dry-run output with selected packs and compact considered routes", () => {
		const result = routeIssue(buildRoutingContext(repoRoot, extensionRoot), {
			number: 42,
			url: "https://github.com/example/repo/issues/42",
			title: "Fix flaky regression",
			body: "Reproduce the flaky bug and add tests for the regression.",
			labels: ["bug", "testing"],
		});
		const formatted = formatDryRun(result);
		expect(formatted).toContain("Skill routing dry run for https://github.com/example/repo/issues/42");
		expect(formatted).toContain("Worker pack:");
		expect(formatted).toContain("Review pack:");
		expect(formatted).toContain("- diagnosing-bugs (high) routes=bug-diagnosis");
		expect(formatted).toContain("Considered routes:");
		expect(formatted).not.toContain("accessibility [not selected");
	});

	test("formats prompt contract with mandatory reading guidance and selected skill paths", () => {
		const result = routeIssue(buildRoutingContext(repoRoot, extensionRoot), {
			title: "Improve accessibility labels",
			body: "Screen reader users need keyboard focus states tested.",
			labels: ["accessibility"],
		});
		const formatted = formatRoutingPromptContract(result);
		expect(formatted).toContain("Issue-aware skill routing contract:");
		expect(formatted).toContain("read the selected SKILL.md files below before acting");
		expect(formatted).toContain("Worker skill pack:");
		expect(formatted).toContain("Review skill pack:");
		expect(formatted).toContain("- accessibility (high) routes=accessibility");
		expect(formatted).toContain(path.join(path.resolve(extensionRoot, "..", "..", "skills"), "accessibility", "SKILL.md"));
		expect(formatted).toContain("Skill adjustments: none");
	});

	test("formats ticket skill hint instructions from validation state", () => {
		const valid = formatTicketSkillHintInstructions(buildRoutingContext(repoRoot, extensionRoot).validation);
		expect(valid).toContain("Issue-aware skill routing for ticket creation:");
		expect(valid).toContain("Routing config validation passed.");
		expect(valid).toContain("matt-agent-skill-hints");
	});
});

describe("routeIssue", () => {
	test("keeps worker baseline even when baseline skill is disabled", () => {
		mkdirSync(path.join(repoRoot, ".pi"), { recursive: true });
		writeFileSync(path.join(repoRoot, ".pi", "matt-skill-routes.json"), JSON.stringify({ version: 1, disabledSkills: ["tdd"] }), "utf8");
		const result = routeIssue(buildRoutingContext(repoRoot, extensionRoot), { title: "Add tests", body: "Need coverage", labels: ["testing"] });
		expect(result.worker.baseline.map((item) => item.skillId)).toEqual(["implement", "tdd"]);
		expect(result.worker.routed.map((item) => item.skillId)).not.toContain("tdd");
	});

	test("promotes confidence when multiple evidence fields match and dedupes selected skills", () => {
		const result = routeIssue(buildRoutingContext(repoRoot, extensionRoot), {
			title: "Fix flaky regression",
			body: "Reproduce the flaky bug and add tests for the regression.",
			labels: ["bug", "testing"],
		});
		const diagnosing = result.worker.routed.find((item) => item.skillId === "diagnosing-bugs");
		expect(diagnosing?.confidence).toBe("high");
		expect(diagnosing?.routeIds).toEqual(["bug-diagnosis"]);
		expect(result.worker.baseline.find((item) => item.skillId === "tdd")?.routeIds).toContain("test-focused");
	});

	test("trims medium-confidence overflow after dedupe but reports high-confidence overflow as invalid", () => {
		mkdirSync(path.join(repoRoot, ".pi"), { recursive: true });
		writeSkill(repoRoot, ".pi/skills/domain/SKILL.md");
		writeFileSync(
			path.join(repoRoot, ".pi", "matt-skill-routes.json"),
			JSON.stringify({
				version: 1,
				limits: { workerMaxRoutedSkills: 1, reviewMaxRoutedSkills: 1 },
				skills: [{ id: "domain", title: "Domain", compatibility: ["worker", "review"], safety: "allowlisted", resolver: { type: "repo", relativePath: ".pi/skills/domain/SKILL.md" } }],
				routes: [
					{ id: "domain", skillIds: ["domain"], confidence: "medium", rationale: "Domain work", title: ["domain"] },
					{ id: "architecture-high", skillIds: ["codebase-design"], confidence: "high", rationale: "Architecture work", title: ["architecture"] },
					{ id: "domain-high", skillIds: ["domain"], confidence: "high", rationale: "Domain critical", body: ["critical domain"] },
				],
			}),
			"utf8",
		);
		const medium = routeIssue(buildRoutingContext(repoRoot, extensionRoot), { title: "domain observability", body: "logs", labels: [] });
		expect(medium.worker.routed).toHaveLength(1);
		expect(medium.worker.skipped.some((item) => item.reason.includes("cap 1 reached"))).toBe(true);

		const high = routeIssue(buildRoutingContext(repoRoot, extensionRoot), { title: "architecture", body: "critical domain", labels: [] });
		expect(high.validation.ok).toBe(false);
		expect(high.validation.diagnostics.map((item) => item.code)).toContain("worker-high-confidence-overflow");
	});

	test("matches path route evidence from issue paths", () => {
		const result = routeIssue(buildRoutingContext(repoRoot, extensionRoot), {
			title: "Polish component",
			body: "Update UI copy.",
			labels: [],
			paths: ["src/components/ProfileCard.tsx"],
		});
		expect(result.worker.routed.map((item) => item.skillId)).toContain("react-performance-guidelines");
		expect(result.worker.routed.find((item) => item.skillId === "react-performance-guidelines")?.evidence).toContain("path:src/components/ProfileCard.tsx matches .tsx");
	});

	test("low-confidence route evidence is considered but not selected unless reinforced", () => {
		mkdirSync(path.join(repoRoot, ".pi"), { recursive: true });
		writeSkill(repoRoot, ".pi/skills/domain/SKILL.md");
		writeFileSync(
			path.join(repoRoot, ".pi", "matt-skill-routes.json"),
			JSON.stringify({
				version: 1,
				skills: [{ id: "domain", compatibility: ["worker"], safety: "allowlisted", resolver: { type: "repo", relativePath: ".pi/skills/domain/SKILL.md" } }],
				routes: [{ id: "domain-low", skillIds: ["domain"], confidence: "low", rationale: "Domain hint", title: ["domain"], body: ["domain"] }],
			}),
			"utf8",
		);
		const low = routeIssue(buildRoutingContext(repoRoot, extensionRoot), { title: "domain", body: "", labels: [] });
		expect(low.worker.routed.map((item) => item.skillId)).not.toContain("domain");
		expect(low.worker.skipped.some((item) => item.skillId === "domain")).toBe(true);

		const promoted = routeIssue(buildRoutingContext(repoRoot, extensionRoot), { title: "domain", body: "domain", labels: [] });
		expect(promoted.worker.routed.map((item) => item.skillId)).toContain("domain");
	});
});
