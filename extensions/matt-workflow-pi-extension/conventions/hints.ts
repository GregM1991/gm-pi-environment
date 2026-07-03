import { existsSync } from "node:fs";
import path from "node:path";
import type { ConventionsContext } from "./types";

export function trackerHint(context: ConventionsContext, cwd: string): string {
	const configured = context.validation.ok ? context.config?.tracker : undefined;
	if (configured) {
		return `This repo uses GitHub Issues as the durable tracker and labels from \`${configured.labelsDocPath}\`.`;
	}
	return existsSync(path.join(cwd, "docs", "agents", "triage-labels.md"))
		? "This repo uses GitHub Issues as the durable tracker and labels from `docs/agents/triage-labels.md`."
		: "Use GitHub Issues as the durable tracker unless repo docs say otherwise. No `docs/agents/triage-labels.md` was detected; follow the repo's own tracker/label conventions, or recommend `setup-matt-pocock-skills` if none exist.";
}

export function toolchainHint(context: ConventionsContext, cwd: string): string {
	const configured = context.validation.ok ? context.config?.toolchain : undefined;
	if (configured) {
		const commandParts = Object.entries(configured.commands ?? {}).map(([name, command]) => `${name}: \`${command}\``);
		return [`This repo is ${configured.runtime}-first. Use repo-local toolchain conventions.`, commandParts.length ? `Preferred commands: ${commandParts.join(", ")}.` : undefined].filter(Boolean).join(" ");
	}
	const bunFirst = existsSync(path.join(cwd, "bun.lock")) || existsSync(path.join(cwd, "bun.lockb"));
	return bunFirst ? "This repo is Bun-first. Use Bun commands from `AGENTS.md`." : "Use the repo's own package manager, toolchain, and scripts as documented in `AGENTS.md`; do not assume a specific runtime.";
}

export function docsHint(context: ConventionsContext, cwd: string): string {
	const configured = context.validation.ok ? context.config?.docs : undefined;
	if (configured) {
		const extras = configured.extraContextDocs?.length ? ` Additional context docs: ${configured.extraContextDocs.map((doc) => `\`${doc}\``).join(", ")}.` : "";
		return `There is an expanded repo-local workflow doc at \`${configured.workflowDocPath}\`; consult it only when phase guidance is insufficient.${extras}`;
	}
	const workflowDoc = path.join(cwd, "docs", "agents", "matt-pocock-ai-feature-workflow.md");
	return existsSync(workflowDoc)
		? "There is an expanded repo-local workflow doc at `docs/agents/matt-pocock-ai-feature-workflow.md`; consult it only when phase guidance is insufficient."
		: "No expanded repo-local workflow doc was detected; rely on the phase engineering-skill references below.";
}

export function formatConventionsHints(context: ConventionsContext, cwd: string): string[] {
	return [trackerHint(context, cwd), toolchainHint(context, cwd), docsHint(context, cwd)];
}
