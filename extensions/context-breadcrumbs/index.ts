import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import contextBreadcrumbsExtension, { DEFAULT_CONFIG } from "pi-context-breadcrumbs";

export const DEFAULT_BREADCRUMB_FILENAMES = ["AGENTS.md", "AGENTS.override.md"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveGlobalBreadcrumbFilenames(settings: unknown): string[] {
	if (!isRecord(settings)) return [...DEFAULT_BREADCRUMB_FILENAMES];

	const contextBreadcrumbs = settings["context-breadcrumbs"];
	if (!isRecord(contextBreadcrumbs)) return [...DEFAULT_BREADCRUMB_FILENAMES];

	const includeFilenames = contextBreadcrumbs.includeFilenames;
	if (!Array.isArray(includeFilenames)) return [...DEFAULT_BREADCRUMB_FILENAMES];

	const filenames = includeFilenames.filter(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);
	return filenames.length > 0 ? filenames : [...DEFAULT_BREADCRUMB_FILENAMES];
}

function loadGlobalBreadcrumbFilenames(): string[] {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const settingsPath = join(agentDir, "settings.json");
	if (!existsSync(settingsPath)) return [...DEFAULT_BREADCRUMB_FILENAMES];

	try {
		const settings: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
		return resolveGlobalBreadcrumbFilenames(settings);
	} catch {
		return [...DEFAULT_BREADCRUMB_FILENAMES];
	}
}

export default function configuredContextBreadcrumbsExtension(pi: ExtensionAPI) {
	DEFAULT_CONFIG.includeFilenames = loadGlobalBreadcrumbFilenames();
	return contextBreadcrumbsExtension(pi);
}
