import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildConventionsContext, scaffoldConventionsJson } from "./config";
import { docsHint, toolchainHint, trackerHint } from "./hints";

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
		writeConfig({ version: 2, extra: true, tracker: { type: "linear", labelsDocPath: "docs/agents/triage-labels.md", extra: true }, toolchain: { runtime: "bun", extra: true, commands: { test: "bun test", lint: "bun lint" } }, docs: { workflowDocPath: "docs/agents/workflow.md", extra: true } });
		const codes = buildConventionsContext(repoRoot).validation.diagnostics.map((item) => item.code);
		expect(codes).toContain("invalid-version");
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

	test("hint text uses configured docs, extras, runtime, and commands", () => {
		write("docs/workflow.md");
		write("docs/context.md");
		writeConfig({ version: 1, toolchain: { runtime: "pnpm", commands: { test: "pnpm test", check: "pnpm typecheck", build: "pnpm build" } }, docs: { workflowDocPath: "docs/workflow.md", extraContextDocs: ["docs/context.md"] } });
		const context = buildConventionsContext(repoRoot);
		expect(toolchainHint(context, repoRoot)).toContain("This repo is pnpm-first");
		expect(toolchainHint(context, repoRoot)).toContain("test: `pnpm test`, check: `pnpm typecheck`, build: `pnpm build`");
		expect(docsHint(context, repoRoot)).toContain("`docs/workflow.md`");
		expect(docsHint(context, repoRoot)).toContain("Additional context docs: `docs/context.md`");
	});
});
