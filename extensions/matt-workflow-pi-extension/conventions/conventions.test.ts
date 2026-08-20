import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildConventionsContext, resolveRequiredCheckPolicy, scaffoldConventionsJson } from "./config";
import { docsHint, formatConventionsHints, toolchainHint, trackerHint } from "./hints";

let repoRoot = "";

function write(relativePath: string, content = "# Doc\n"): void {
	const target = path.join(repoRoot, relativePath);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, content, "utf8");
}

function writeConfig(config: unknown): void {
	write(".pi/matt-conventions.json", JSON.stringify(config));
}

beforeEach(() => {
	repoRoot = mkdtempSync(path.join(tmpdir(), "matt-conventions-test-"));
});

afterEach(() => {
	if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
});

describe("repo conventions config", () => {
	test("scaffold JSON contains strict versioned optional sections", () => {
		const scaffold = JSON.parse(scaffoldConventionsJson());
		expect(scaffold.version).toBe(1);
		expect(scaffold.tracker.type).toBe("github-issues");
		expect(scaffold.tracker.labelsDocPath).toBe("docs/agents/triage-labels.md");
		expect(scaffold.toolchain.runtime).toBe("bun");
		expect(scaffold.toolchain.commands.test).toBe("bun test");
		expect(scaffold.docs.workflowDocPath).toBe("docs/agents/matt-pocock-ai-feature-workflow.md");
		expect(scaffold.docs.extraContextDocs).toEqual([]);
	});

	test("missing config is valid and falls back to detection", () => {
		const context = buildConventionsContext(repoRoot);
		expect(context.configExists).toBe(false);
		expect(context.validation.ok).toBe(true);
		expect(trackerHint(context, repoRoot)).toContain("No `docs/agents/triage-labels.md` was detected");
	});

	test("rejects invalid JSON, unknown fields at each level, bad version and tracker type", () => {
		write(".pi/matt-conventions.json", "{nope");
		expect(buildConventionsContext(repoRoot).validation.diagnostics.map((item) => item.code)).toContain("invalid-json");
		write("docs/agents/triage-labels.md");
		write("docs/agents/workflow.md");
		writeConfig({ version: 4, extra: true, tracker: { type: "linear", labelsDocPath: "docs/agents/triage-labels.md", extra: true }, toolchain: { runtime: "bun", extra: true, commands: { test: "bun test", lint: "bun lint" } }, docs: { workflowDocPath: "docs/agents/workflow.md", extra: true } });
		let codes = buildConventionsContext(repoRoot).validation.diagnostics.map((item) => item.code);
		expect(codes).toContain("invalid-version");
		writeConfig({ version: 2, extra: true, tracker: { type: "linear", labelsDocPath: "docs/agents/triage-labels.md", extra: true }, toolchain: { runtime: "bun", extra: true, commands: { test: "bun test", lint: "bun lint" } }, docs: { workflowDocPath: "docs/agents/workflow.md", extra: true } });
		codes = buildConventionsContext(repoRoot).validation.diagnostics.map((item) => item.code);
		expect(codes).toContain("invalid-tracker-type");
		expect(codes.filter((code) => code === "unknown-config-field").length).toBeGreaterThanOrEqual(5);
	});

	test("rejects absolute escaping URL and missing doc paths", () => {
		writeConfig({ version: 1, tracker: { type: "github-issues", labelsDocPath: "/tmp/labels.md" }, docs: { workflowDocPath: "../outside.md", extraContextDocs: ["https://example.com/doc.md", "docs/missing.md"] } });
		const diagnostics = buildConventionsContext(repoRoot).validation.diagnostics;
		expect(diagnostics.map((item) => item.code)).toEqual(["invalid-doc-path", "invalid-doc-path", "invalid-doc-path", "missing-doc"]);
		expect(buildConventionsContext(repoRoot).validation.ok).toBe(false);
	});

	test("config wins per section and omitted sections use detection fallback", () => {
		write("docs/custom-labels.md");
		write("bun.lock", "");
		writeConfig({ version: 1, tracker: { type: "github-issues", labelsDocPath: "docs/custom-labels.md" } });
		const context = buildConventionsContext(repoRoot);
		expect(context.validation.ok).toBe(true);
		expect(trackerHint(context, repoRoot)).toContain("docs/custom-labels.md");
		expect(toolchainHint(context, repoRoot)).toBe("This repo is Bun-first. Use Bun commands from `AGENTS.md`.");
		expect(docsHint(context, repoRoot)).toBe("No expanded repo-local workflow doc was detected; rely on the phase engineering-skill references below.");
	});

	test("loads version 2 beside version 1 without changing section fallbacks", () => {
		write("docs/custom-labels.md");
		write("docs/architecture/recap-primitives.yaml", "version: 1\n");
		write("bun.lock", "");
		writeConfig({
			version: 2,
			tracker: {
				type: "github-issues",
				labelsDocPath: "docs/custom-labels.md",
				requiredChecks: ["Fallow Audit / fallow-audit", "matt/ai-gate"],
			},
			architecture: { recapPrimitivesPath: "docs/architecture/recap-primitives.yaml" },
		});

		const context = buildConventionsContext(repoRoot);
		expect(context.validation.ok).toBe(true);
		expect(context.config).toEqual({
			version: 2,
			tracker: {
				type: "github-issues",
				labelsDocPath: "docs/custom-labels.md",
				requiredChecks: ["Fallow Audit / fallow-audit", "matt/ai-gate"],
			},
			architecture: { recapPrimitivesPath: "docs/architecture/recap-primitives.yaml" },
		});
		expect(trackerHint(context, repoRoot)).toContain("docs/custom-labels.md");
		expect(toolchainHint(context, repoRoot)).toBe("This repo is Bun-first. Use Bun commands from `AGENTS.md`.");
		expect(docsHint(context, repoRoot)).toBe("No expanded repo-local workflow doc was detected; rely on the phase engineering-skill references below.");
	});

	test("loads version 3 branch-scoped context docs and tells agents when to read them", () => {
		write("docs/workflow.md");
		write("docs/security.md");
		write("docs/release.md");
		writeConfig({
			version: 3,
			docs: {
				workflowDocPath: "docs/workflow.md",
				extraContextDocs: [
					{ path: "docs/security.md", useWhen: "reviewing authentication changes" },
					{ path: "docs/release.md", useWhen: "preparing closeout" },
				],
			},
		});

		const context = buildConventionsContext(repoRoot);
		expect(context.validation.ok).toBe(true);
		expect(context.config).toEqual({
			version: 3,
			docs: {
				workflowDocPath: "docs/workflow.md",
				extraContextDocs: [
					{ path: "docs/security.md", useWhen: "reviewing authentication changes" },
					{ path: "docs/release.md", useWhen: "preparing closeout" },
				],
			},
		});
		expect(formatConventionsHints(context, repoRoot)[2]).toBe(
			"There is an expanded repo-local workflow doc at `docs/workflow.md`; consult it only when phase guidance is insufficient. Additional context docs: read `docs/security.md` when reviewing authentication changes; read `docs/release.md` when preparing closeout.",
		);
	});

	test("rejects malformed version 3 context entries without accepting legacy strings", () => {
		write("docs/workflow.md");
		write("docs/context.md");
		writeConfig({
			version: 3,
			docs: {
				workflowDocPath: "docs/workflow.md",
				extraContextDocs: [
					"docs/context.md",
					{ path: "docs/context.md" },
					{ path: "docs/context.md", useWhen: "   ", extra: true },
					{ path: "docs/missing.md", useWhen: "running a review" },
					{ path: "../outside.md", useWhen: "preparing a release" },
				],
			},
		});

		const diagnostics = buildConventionsContext(repoRoot).validation.diagnostics;
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-extra-context-doc", path: "docs.extraContextDocs[0]" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-use-when", path: "docs.extraContextDocs[1].useWhen" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-use-when", path: "docs.extraContextDocs[2].useWhen" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-config-field", path: "docs.extraContextDocs[2].extra" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "missing-doc", path: "docs.extraContextDocs[3].path" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-doc-path", path: "docs.extraContextDocs[4].path" }));
	});

	test("preserves version 1 and version 2 extra-context hint formatting", () => {
		write("docs/workflow.md");
		write("docs/context.md");
		writeConfig({ version: 1, docs: { workflowDocPath: "docs/workflow.md", extraContextDocs: ["docs/context.md"] } });
		const version1Hint = docsHint(buildConventionsContext(repoRoot), repoRoot);

		writeConfig({ version: 2, docs: { workflowDocPath: "docs/workflow.md", extraContextDocs: ["docs/context.md"] } });
		const version2Hint = docsHint(buildConventionsContext(repoRoot), repoRoot);

		const legacyHint = "There is an expanded repo-local workflow doc at `docs/workflow.md`; consult it only when phase guidance is insufficient. Additional context docs: `docs/context.md`.";
		expect(version1Hint).toBe(legacyHint);
		expect(version2Hint).toBe(legacyHint);
	});

	test("version 3 retains version 2 delivery policy and architecture fields", () => {
		write("docs/labels.md");
		write("docs/recap.yaml");
		writeConfig({
			version: 3,
			tracker: { type: "github-issues", labelsDocPath: "docs/labels.md", requiredChecks: ["configured/check"] },
			architecture: { recapPrimitivesPath: "docs/recap.yaml" },
		});

		const context = buildConventionsContext(repoRoot);
		expect(context.validation.ok).toBe(true);
		expect(resolveRequiredCheckPolicy(context)).toEqual({
			status: "resolved",
			source: "configured",
			requiredChecks: ["configured/check"],
		});
		expect(context.config).toEqual({
			version: 3,
			tracker: { type: "github-issues", labelsDocPath: "docs/labels.md", requiredChecks: ["configured/check"] },
			architecture: { recapPrimitivesPath: "docs/recap.yaml" },
		});
	});

	test("rejects malformed version 2 delivery policy and recap references", () => {
		write("docs/labels.md");
		writeConfig({
			version: 2,
			tracker: {
				type: "github-issues",
				labelsDocPath: "docs/labels.md",
				requiredChecks: ["check-a", " ", "check-a"],
			},
			architecture: {
				recapPrimitivesPath: "../recap-primitives.yaml",
				extra: true,
			},
		});

		const diagnostics = buildConventionsContext(repoRoot).validation.diagnostics;
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-required-check", path: "tracker.requiredChecks[1]" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate-required-check", path: "tracker.requiredChecks[2]" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-doc-path", path: "architecture.recapPrimitivesPath" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-config-field", path: "architecture.extra" }));

		writeConfig({
			version: 2,
			tracker: { type: "github-issues", labelsDocPath: "docs/labels.md", requiredChecks: [] },
			architecture: { recapPrimitivesPath: "docs/missing.yaml" },
		});
		const missingDiagnostics = buildConventionsContext(repoRoot).validation.diagnostics;
		expect(missingDiagnostics).toContainEqual(expect.objectContaining({ code: "invalid-required-checks", path: "tracker.requiredChecks" }));
		expect(missingDiagnostics).toContainEqual(expect.objectContaining({ code: "missing-doc", path: "architecture.recapPrimitivesPath" }));
	});

	test("version 2 requires explicit configured checks when tracker policy is present", () => {
		write("docs/labels.md");
		writeConfig({ version: 2, tracker: { type: "github-issues", labelsDocPath: "docs/labels.md" } });
		expect(buildConventionsContext(repoRoot).validation.diagnostics).toContainEqual(
			expect.objectContaining({ code: "invalid-required-checks", path: "tracker.requiredChecks" }),
		);
	});

	test("version 1 rejects version 2 fields instead of partially accepting them", () => {
		write("docs/labels.md");
		write("docs/recap.yaml");
		writeConfig({
			version: 1,
			tracker: { type: "github-issues", labelsDocPath: "docs/labels.md", requiredChecks: ["check-a"] },
			architecture: { recapPrimitivesPath: "docs/recap.yaml" },
		});
		const diagnostics = buildConventionsContext(repoRoot).validation.diagnostics;
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-config-field", path: "tracker.requiredChecks" }));
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-config-field", path: "architecture" }));
	});

	test("accepts aiGate as an optional configured command", () => {
		writeConfig({ version: 1, toolchain: { runtime: "bun", commands: { test: "bun test", aiGate: "bun run ai-gate --base main --head HEAD" } } });
		const context = buildConventionsContext(repoRoot);
		expect(context.validation.ok).toBe(true);
		expect(context.config?.toolchain?.commands?.aiGate).toBe("bun run ai-gate --base main --head HEAD");
		expect(toolchainHint(context, repoRoot)).toContain("aiGate: `bun run ai-gate --base main --head HEAD`");
	});

	test("rejects blank aiGate commands", () => {
		writeConfig({ version: 1, toolchain: { runtime: "bun", commands: { aiGate: "   " } } });
		const diagnostics = buildConventionsContext(repoRoot).validation.diagnostics;
		expect(diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-command", path: "toolchain.commands.aiGate" }));
	});

	test("resolves native required checks before configured fallback and otherwise hard-stops", () => {
		write("docs/labels.md");
		writeConfig({
			version: 2,
			tracker: {
				type: "github-issues",
				labelsDocPath: "docs/labels.md",
				requiredChecks: ["configured/check"],
			},
		});
		const configuredContext = buildConventionsContext(repoRoot);

		expect(resolveRequiredCheckPolicy(configuredContext, ["native/check"])).toEqual({
			status: "resolved",
			source: "github",
			requiredChecks: ["native/check"],
		});
		expect(resolveRequiredCheckPolicy(configuredContext)).toEqual({
			status: "resolved",
			source: "configured",
			requiredChecks: ["configured/check"],
		});

		writeConfig({ version: 1, tracker: { type: "github-issues", labelsDocPath: "docs/labels.md" } });
		expect(resolveRequiredCheckPolicy(buildConventionsContext(repoRoot))).toEqual({
			status: "hard-stop",
			reason: "missing-required-check-policy",
			message: "Delivery requires native GitHub required-check policy or tracker.requiredChecks in repo conventions version 2 or version 3.",
		});
	});

	test("hint text uses configured docs, extras, runtime, and commands", () => {
		write("docs/workflow.md");
		write("docs/context.md");
		writeConfig({ version: 1, toolchain: { runtime: "pnpm", commands: { test: "pnpm test", check: "pnpm typecheck", build: "pnpm build", aiGate: "pnpm ai-gate" } }, docs: { workflowDocPath: "docs/workflow.md", extraContextDocs: ["docs/context.md"] } });
		const context = buildConventionsContext(repoRoot);
		expect(context.validation.ok).toBe(true);
		expect(toolchainHint(context, repoRoot)).toContain("This repo is pnpm-first");
		expect(toolchainHint(context, repoRoot)).toContain("test: `pnpm test`, check: `pnpm typecheck`, build: `pnpm build`, aiGate: `pnpm ai-gate`");
		expect(docsHint(context, repoRoot)).toContain("`docs/workflow.md`");
		expect(docsHint(context, repoRoot)).toContain("Additional context docs: `docs/context.md`");
	});
});
