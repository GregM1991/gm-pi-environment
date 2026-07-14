import type { ConsideredRoute, RouteResult, SkillPack, SkillSelection, SkippedSkill, ValidationResult } from "./types";
import { formatValidationDiagnostics } from "./config";

function formatSelection(selection: SkillSelection): string {
	const routeText = selection.routeIds.length ? ` routes=${selection.routeIds.join(",")}` : "";
	const rationale = selection.rationale.length ? ` — ${selection.rationale.join("; ")}` : "";
	return `- ${selection.skillId} (${selection.confidence}${selection.baseline ? ", baseline" : ""})${routeText}\n  path: ${selection.absolutePath}\n  evidence: ${selection.evidence.join("; ") || "none"}${rationale}`;
}

function formatSkipped(skipped: SkippedSkill): string {
	const subject = skipped.skillId ? skipped.skillId : skipped.routeId ? `route ${skipped.routeId}` : "selection";
	const confidence = skipped.confidence ? ` (${skipped.confidence})` : "";
	const evidence = skipped.evidence?.length ? ` evidence=${skipped.evidence.join("; ")}` : "";
	return `- ${subject}${confidence}: ${skipped.reason}${evidence}`;
}

function formatPack(title: string, pack: SkillPack): string {
	const lines = [`${title}:`];
	lines.push(`Baseline skills (${pack.baseline.length}):`);
	lines.push(pack.baseline.length ? pack.baseline.map(formatSelection).join("\n") : "- none");
	lines.push(`Routed skills (${pack.routed.length}):`);
	lines.push(pack.routed.length ? pack.routed.map(formatSelection).join("\n") : "- none");
	if (pack.overflowHighConfidence) lines.push(`High-confidence overflow: yes — stop automation and split the ticket before implementation.`);
	if (pack.skipped.length) {
		lines.push("Skipped/considered skill selections:");
		lines.push(pack.skipped.map(formatSkipped).join("\n"));
	}
	return lines.join("\n");
}

function relevantConsideredRoutes(routes: ConsideredRoute[]): ConsideredRoute[] {
	return routes.filter((route) => route.matched || route.disabled || route.confidence === "low");
}

function formatConsidered(routes: ConsideredRoute[]): string {
	const relevant = relevantConsideredRoutes(routes);
	if (!relevant.length) return "Considered routes: none matched or otherwise relevant.";
	return [
		"Considered routes:",
		...relevant.map((route) => {
			const state = route.disabled ? "disabled" : route.matched ? "matched" : "not selected";
			const evidence = route.evidence.length ? route.evidence.join("; ") : "no matching evidence";
			return `- ${route.routeId} [${state}, ${route.confidence}] skills=${route.skillIds.join(", ")} evidence=${evidence} rationale=${route.rationale}`;
		}),
	].join("\n");
}

export function formatDryRun(result: RouteResult): string {
	return [
		`Skill routing dry run for ${result.issue.url ?? result.issue.number ?? result.issue.title}`,
		`Config: ${result.configPath}`,
		`Limits: worker=${result.limits.workerMaxRoutedSkills}, review=${result.limits.reviewMaxRoutedSkills}`,
		formatValidationDiagnostics(result.validation),
		"",
		formatPack("Worker pack", result.worker),
		"",
		formatPack("Review pack", result.review),
		"",
		formatConsidered(result.considered),
	].join("\n");
}

export function formatRoutingPromptContract(result: RouteResult): string {
	return [
		"Issue-aware skill routing contract:",
		`- Routing config: ${result.configPath}`,
		`- Routing validation: ${result.validation.ok ? "passed" : "failed; stop before implementation/review"}`,
		"- Mandatory upfront guidance for child agents: read the selected SKILL.md files below before acting. Do not inline full skill contents into the prompt.",
		"- Worker may make compact Skill adjustments after repo exploration, using only registered available skill IDs. Output `Skill adjustments: none` when unchanged; otherwise list only added/removed skill IDs with one evidence-backed reason.",
		"- Skill routing is guidance only. Do not add audit ceremony, do not mention skill names in commit messages or closeout comments, and keep implementation/review scope tied to the issue.",
		"",
		formatPack("Worker skill pack", result.worker),
		"",
		formatPack("Review skill pack", result.review),
	].join("\n");
}

export function formatTicketSkillHintInstructions(validation: ValidationResult): string {
	return [
		"Issue-aware skill routing for ticket creation:",
		`- ${formatValidationDiagnostics(validation).replace(/\n/g, "\n- ")}`,
		"- Because routing config is valid, include low-authority agent skill hints in each ticket you create.",
		"- Add a visible Markdown section named `## Agent skill hints` with worker/review skill IDs, route IDs, and one-line evidence/rationale. Use `none` when there is no evidence-backed route.",
		"- Add adjacent machine-readable metadata in an HTML comment exactly shaped as JSON: `<!-- matt-agent-skill-hints {\"version\":1,\"workerSkillIds\":[],\"reviewSkillIds\":[],\"routeIds\":[]} -->`.",
		"- These hints are diagnostics, not binding instructions; auto mode recomputes routing from the final child issue state before implementation.",
	].join("\n");
}
