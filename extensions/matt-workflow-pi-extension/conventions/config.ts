import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ValidationDiagnostic, ValidationResult } from "../skill-routing/types";
import type {
	ConventionsContext,
	RepoConventionsConfig,
	RepoConventionsConfigV1,
	RepoConventionsConfigV2,
	RepoConventionsConfigV3,
	RequiredCheckPolicy,
} from "./types";

const TOP_LEVEL_KEYS_V1 = new Set(["version", "tracker", "toolchain", "docs"]);
const TOP_LEVEL_KEYS_V2 = new Set([...TOP_LEVEL_KEYS_V1, "architecture"]);
const TRACKER_KEYS_V1 = new Set(["type", "labelsDocPath"]);
const TRACKER_KEYS_V2 = new Set([...TRACKER_KEYS_V1, "requiredChecks"]);
const TOOLCHAIN_KEYS = new Set(["runtime", "commands"]);
const COMMAND_KEYS = new Set(["test", "check", "build", "aiGate"]);
const DOCS_KEYS = new Set(["workflowDocPath", "extraContextDocs"]);
const EXTRA_CONTEXT_DOC_KEYS_V3 = new Set(["path", "useWhen"]);
const ARCHITECTURE_KEYS = new Set(["recapPrimitivesPath"]);

const diagnostic = (code: string, message: string, pathName?: string): ValidationDiagnostic => ({
	severity: "error",
	code,
	message,
	path: pathName,
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function validateDocPath(repoRoot: string, value: unknown, errors: ValidationDiagnostic[], pathName: string): string | undefined {
	if (!nonEmptyString(value)) {
		errors.push(diagnostic("invalid-doc-path", "Doc paths must be non-empty repo-relative strings.", pathName));
		return undefined;
	}
	if (path.isAbsolute(value) || /^[a-z]+:\/\//i.test(value)) {
		errors.push(diagnostic("invalid-doc-path", "Doc paths must be repo-relative local paths, not absolute paths or URLs.", pathName));
		return undefined;
	}
	const resolved = path.resolve(repoRoot, value);
	const relative = path.relative(repoRoot, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		errors.push(diagnostic("invalid-doc-path", "Doc paths must stay inside the repo root.", pathName));
		return undefined;
	}
	if (!existsSync(resolved)) {
		errors.push(diagnostic("missing-doc", `Referenced doc does not exist: ${value}.`, pathName));
	}
	return value;
}

function validateTrackerV1(repoRoot: string, value: unknown, errors: ValidationDiagnostic[]): RepoConventionsConfigV1["tracker"] | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push(diagnostic("invalid-tracker", "tracker must be an object.", "tracker"));
		return undefined;
	}
	for (const key of Object.keys(value)) if (!TRACKER_KEYS_V1.has(key)) errors.push(diagnostic("unknown-config-field", `Unknown tracker field '${key}'.`, `tracker.${key}`));
	if (value.type !== "github-issues") errors.push(diagnostic("invalid-tracker-type", "tracker.type must be github-issues.", "tracker.type"));
	const labelsDocPath = validateDocPath(repoRoot, value.labelsDocPath, errors, "tracker.labelsDocPath");
	return value.type === "github-issues" && labelsDocPath ? { type: "github-issues", labelsDocPath } : undefined;
}

function validateTrackerV2(repoRoot: string, value: unknown, errors: ValidationDiagnostic[]): RepoConventionsConfigV2["tracker"] | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push(diagnostic("invalid-tracker", "tracker must be an object.", "tracker"));
		return undefined;
	}
	for (const key of Object.keys(value)) if (!TRACKER_KEYS_V2.has(key)) errors.push(diagnostic("unknown-config-field", `Unknown tracker field '${key}'.`, `tracker.${key}`));
	if (value.type !== "github-issues") errors.push(diagnostic("invalid-tracker-type", "tracker.type must be github-issues.", "tracker.type"));
	const labelsDocPath = validateDocPath(repoRoot, value.labelsDocPath, errors, "tracker.labelsDocPath");
	let requiredChecks: string[] | undefined;
	if (!Array.isArray(value.requiredChecks) || value.requiredChecks.length === 0) {
		errors.push(diagnostic("invalid-required-checks", "tracker.requiredChecks must be a non-empty string array.", "tracker.requiredChecks"));
	} else {
		requiredChecks = [];
		const seen = new Set<string>();
		value.requiredChecks.forEach((item, index) => {
			if (!nonEmptyString(item)) {
				errors.push(diagnostic("invalid-required-check", "Required check names must be non-empty strings.", `tracker.requiredChecks[${index}]`));
				return;
			}
			if (seen.has(item)) {
				errors.push(diagnostic("duplicate-required-check", `Duplicate required check '${item}'.`, `tracker.requiredChecks[${index}]`));
				return;
			}
			seen.add(item);
			requiredChecks?.push(item);
		});
	}
	return value.type === "github-issues" && labelsDocPath && requiredChecks
		? { type: "github-issues", labelsDocPath, requiredChecks }
		: undefined;
}

function validateToolchain(value: unknown, errors: ValidationDiagnostic[]): RepoConventionsConfigV1["toolchain"] | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push(diagnostic("invalid-toolchain", "toolchain must be an object.", "toolchain"));
		return undefined;
	}
	for (const key of Object.keys(value)) if (!TOOLCHAIN_KEYS.has(key)) errors.push(diagnostic("unknown-config-field", `Unknown toolchain field '${key}'.`, `toolchain.${key}`));
	if (!nonEmptyString(value.runtime)) errors.push(diagnostic("invalid-runtime", "toolchain.runtime must be a non-empty string.", "toolchain.runtime"));
	let commands: RepoConventionsConfigV1["toolchain"] extends { commands?: infer C } ? C : never;
	if (value.commands !== undefined) {
		if (!isRecord(value.commands)) {
			errors.push(diagnostic("invalid-commands", "toolchain.commands must be an object.", "toolchain.commands"));
		} else {
			commands = {} as typeof commands;
			for (const key of Object.keys(value.commands)) {
				if (!COMMAND_KEYS.has(key)) {
					errors.push(diagnostic("unknown-config-field", `Unknown toolchain command '${key}'.`, `toolchain.commands.${key}`));
					continue;
				}
				const command = value.commands[key];
				if (!nonEmptyString(command)) errors.push(diagnostic("invalid-command", `${key} command must be a non-empty string.`, `toolchain.commands.${key}`));
				else (commands as Record<string, string>)[key] = command;
			}
		}
	}
	return nonEmptyString(value.runtime) ? { runtime: value.runtime, ...(commands ? { commands } : {}) } : undefined;
}

function validateDocs(repoRoot: string, value: unknown, errors: ValidationDiagnostic[]): RepoConventionsConfigV1["docs"] | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push(diagnostic("invalid-docs", "docs must be an object.", "docs"));
		return undefined;
	}
	for (const key of Object.keys(value)) if (!DOCS_KEYS.has(key)) errors.push(diagnostic("unknown-config-field", `Unknown docs field '${key}'.`, `docs.${key}`));
	const workflowDocPath = validateDocPath(repoRoot, value.workflowDocPath, errors, "docs.workflowDocPath");
	let extraContextDocs: string[] | undefined;
	if (value.extraContextDocs !== undefined) {
		if (!Array.isArray(value.extraContextDocs)) errors.push(diagnostic("invalid-doc-path", "docs.extraContextDocs must be a string array.", "docs.extraContextDocs"));
		else extraContextDocs = value.extraContextDocs.map((item, index) => validateDocPath(repoRoot, item, errors, `docs.extraContextDocs[${index}]`)).filter((item): item is string => Boolean(item));
	}
	return workflowDocPath ? { workflowDocPath, ...(extraContextDocs ? { extraContextDocs } : {}) } : undefined;
}

function validateDocsV3(repoRoot: string, value: unknown, errors: ValidationDiagnostic[]): RepoConventionsConfigV3["docs"] | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push(diagnostic("invalid-docs", "docs must be an object.", "docs"));
		return undefined;
	}
	for (const key of Object.keys(value)) if (!DOCS_KEYS.has(key)) errors.push(diagnostic("unknown-config-field", `Unknown docs field '${key}'.`, `docs.${key}`));
	const workflowDocPath = validateDocPath(repoRoot, value.workflowDocPath, errors, "docs.workflowDocPath");
	let extraContextDocs: NonNullable<RepoConventionsConfigV3["docs"]>["extraContextDocs"];
	if (value.extraContextDocs !== undefined) {
		if (!Array.isArray(value.extraContextDocs)) {
			errors.push(diagnostic("invalid-extra-context-docs", "docs.extraContextDocs must be an array of path-plus-useWhen objects.", "docs.extraContextDocs"));
		} else {
			extraContextDocs = value.extraContextDocs.flatMap((item, index) => {
				const itemPath = `docs.extraContextDocs[${index}]`;
				if (!isRecord(item)) {
					errors.push(diagnostic("invalid-extra-context-doc", "Extra context docs must be path-plus-useWhen objects.", itemPath));
					return [];
				}
				for (const key of Object.keys(item)) {
					if (!EXTRA_CONTEXT_DOC_KEYS_V3.has(key)) errors.push(diagnostic("unknown-config-field", `Unknown extra context doc field '${key}'.`, `${itemPath}.${key}`));
				}
				const contextPath = validateDocPath(repoRoot, item.path, errors, `${itemPath}.path`);
				if (!nonEmptyString(item.useWhen)) errors.push(diagnostic("invalid-use-when", "useWhen must be a non-empty string describing when the workflow branch requires this document.", `${itemPath}.useWhen`));
				return contextPath && nonEmptyString(item.useWhen) ? [{ path: contextPath, useWhen: item.useWhen }] : [];
			});
		}
	}
	return workflowDocPath ? { workflowDocPath, ...(extraContextDocs ? { extraContextDocs } : {}) } : undefined;
}

function validateArchitecture(repoRoot: string, value: unknown, errors: ValidationDiagnostic[]): RepoConventionsConfigV2["architecture"] | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push(diagnostic("invalid-architecture", "architecture must be an object.", "architecture"));
		return undefined;
	}
	for (const key of Object.keys(value)) if (!ARCHITECTURE_KEYS.has(key)) errors.push(diagnostic("unknown-config-field", `Unknown architecture field '${key}'.`, `architecture.${key}`));
	const recapPrimitivesPath = validateDocPath(repoRoot, value.recapPrimitivesPath, errors, "architecture.recapPrimitivesPath");
	return recapPrimitivesPath ? { recapPrimitivesPath } : undefined;
}

export function conventionsPathFor(repoRoot: string): string {
	return path.join(repoRoot, ".pi", "matt-conventions.json");
}

export function scaffoldConventionsJson(): string {
	return `${JSON.stringify({ version: 1, tracker: { type: "github-issues", labelsDocPath: "docs/agents/triage-labels.md" }, toolchain: { runtime: "bun", commands: { test: "bun test", check: "bun run check", build: "bun run build" } }, docs: { workflowDocPath: "docs/agents/matt-pocock-ai-feature-workflow.md", extraContextDocs: [] } }, null, 2)}\n`;
}

export function scaffoldConventions(repoRoot: string): { created: boolean; path: string; message: string } {
	const target = conventionsPathFor(repoRoot);
	if (existsSync(target)) return { created: false, path: target, message: `Repo conventions config already exists: ${target}` };
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, scaffoldConventionsJson(), "utf8");
	return { created: true, path: target, message: `Created repo conventions config: ${target}` };
}

function parseConventionsConfig(repoRoot: string, configPath: string): { config?: RepoConventionsConfig; diagnostics: ValidationDiagnostic[]; exists: boolean } {
	if (!existsSync(configPath)) return { diagnostics: [], exists: false };
	const diagnostics: ValidationDiagnostic[] = [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (error) {
		return { diagnostics: [diagnostic("invalid-json", `Invalid strict JSON in ${configPath}: ${error instanceof Error ? error.message : String(error)}`)], exists: true };
	}
	if (!isRecord(parsed)) return { diagnostics: [diagnostic("invalid-config", "Repo conventions config must be a JSON object.")], exists: true };
	if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) {
		return { diagnostics: [diagnostic("invalid-version", "Repo conventions config requires version: 1, version: 2, or version: 3.", "version")], exists: true };
	}
	const version = parsed.version;
	const topLevelKeys = version === 1 ? TOP_LEVEL_KEYS_V1 : TOP_LEVEL_KEYS_V2;
	for (const key of Object.keys(parsed)) if (!topLevelKeys.has(key)) diagnostics.push(diagnostic("unknown-config-field", `Unknown top-level config field '${key}'.`, key));
	const tracker = version === 1 ? validateTrackerV1(repoRoot, parsed.tracker, diagnostics) : validateTrackerV2(repoRoot, parsed.tracker, diagnostics);
	const toolchain = validateToolchain(parsed.toolchain, diagnostics);
	const docs = version === 3 ? validateDocsV3(repoRoot, parsed.docs, diagnostics) : validateDocs(repoRoot, parsed.docs, diagnostics);
	if (version === 1) {
		return { config: { version, ...(tracker ? { tracker } : {}), ...(toolchain ? { toolchain } : {}), ...(docs ? { docs } : {}) }, diagnostics, exists: true };
	}
	const architecture = validateArchitecture(repoRoot, parsed.architecture, diagnostics);
	if (version === 3) {
		return { config: { version, ...(tracker ? { tracker } : {}), ...(toolchain ? { toolchain } : {}), ...(docs ? { docs } : {}), ...(architecture ? { architecture } : {}) }, diagnostics, exists: true };
	}
	return { config: { version, ...(tracker ? { tracker } : {}), ...(toolchain ? { toolchain } : {}), ...(docs ? { docs } : {}), ...(architecture ? { architecture } : {}) }, diagnostics, exists: true };
}

export function buildConventionsContext(repoRoot: string): ConventionsContext {
	const configPath = conventionsPathFor(repoRoot);
	const parsed = parseConventionsConfig(repoRoot, configPath);
	return { repoRoot, configPath, configExists: parsed.exists, config: parsed.config, validation: { ok: parsed.diagnostics.length === 0, diagnostics: parsed.diagnostics } };
}

export function resolveRequiredCheckPolicy(context: ConventionsContext, nativeRequiredChecks?: string[]): RequiredCheckPolicy {
	if (nativeRequiredChecks !== undefined) {
		return { status: "resolved", source: "github", requiredChecks: [...nativeRequiredChecks] };
	}
	const configured = context.validation.ok && context.config && context.config.version !== 1 ? context.config.tracker?.requiredChecks : undefined;
	if (configured) {
		return { status: "resolved", source: "configured", requiredChecks: [...configured] };
	}
	return {
		status: "hard-stop",
		reason: "missing-required-check-policy",
		message: "Delivery requires native GitHub required-check policy or tracker.requiredChecks in repo conventions version 2 or version 3.",
	};
}

export function formatConventionsDiagnostics(validation: ValidationResult): string {
	if (validation.ok) return "Repo conventions config validation passed.";
	return ["Repo conventions config validation failed:", ...validation.diagnostics.map((item) => `- ${item.code}${item.path ? ` (${item.path})` : ""}: ${item.message}`)].join("\n");
}
