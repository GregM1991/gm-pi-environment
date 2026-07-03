import { BASELINE_SKILLS } from "./defaults";
import type {
	AgentRole,
	Confidence,
	ConsideredRoute,
	IssueEvidence,
	RouteResult,
	RoutingContext,
	SkillPack,
	SkillSelection,
	SkillRoute,
	SkippedSkill,
	ValidationDiagnostic,
} from "./types";

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const CONFIDENCE_BY_RANK: Confidence[] = ["low", "medium", "high"];

function normalizeLabel(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesPlain(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase());
}

function promoteConfidence(base: Confidence, matchedFieldCount: number): Confidence {
	if (matchedFieldCount >= 2) return CONFIDENCE_BY_RANK[Math.min(2, CONFIDENCE_RANK[base] + 1)];
	return base;
}

function routeEvidence(route: SkillRoute, issue: IssueEvidence): string[] {
	const evidence: string[] = [];
	const issueLabels = new Set(issue.labels.map(normalizeLabel));
	for (const label of route.labels ?? []) {
		if (issueLabels.has(normalizeLabel(label))) evidence.push(`label:${label}`);
	}
	for (const token of route.title ?? []) {
		if (includesPlain(issue.title, token)) evidence.push(`title:${token}`);
	}
	for (const token of route.body ?? []) {
		if (includesPlain(issue.body, token)) evidence.push(`body:${token}`);
	}
	for (const token of route.paths ?? []) {
		for (const issuePath of issue.paths ?? []) {
			if (includesPlain(issuePath, token)) evidence.push(`path:${issuePath} matches ${token}`);
		}
	}
	return evidence;
}

function matchedFieldCount(evidence: string[]): number {
	return new Set(evidence.map((item) => item.split(":", 1)[0])).size;
}

function makeSelection(skillId: string, role: AgentRole, context: RoutingContext, baseline: boolean, order: number): SkillSelection | undefined {
	const skill = context.skills.find((item) => item.id === skillId);
	if (!skill) return undefined;
	if (!skill.compatibility.includes(role)) return undefined;
	if (role === "worker" && skill.safety === "review-only") return undefined;
	return {
		skillId,
		absolutePath: skill.absolutePath,
		confidence: "high",
		baseline,
		routeIds: [],
		evidence: baseline ? ["baseline"] : [],
		rationale: baseline ? [`Baseline ${role} skill`] : [],
		available: skill.available,
		order,
	};
}

function sortedSelections(selections: SkillSelection[]): SkillSelection[] {
	return [...selections].sort((a, b) => {
		const confidenceDelta = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
		if (confidenceDelta !== 0) return confidenceDelta;
		return a.order - b.order;
	});
}

function buildPack(role: AgentRole, context: RoutingContext, candidates: SkillSelection[], selectionDiagnostics: ValidationDiagnostic[]): SkillPack {
	const baselineIds = BASELINE_SKILLS[role];
	const baseline = baselineIds
		.map((skillId, index) => makeSelection(skillId, role, context, true, -1000 + index))
		.filter((item): item is SkillSelection => Boolean(item));
	const baselineById = new Map(baseline.map((item) => [item.skillId, item]));

	const routedById = new Map<string, SkillSelection>();
	const skipped: SkippedSkill[] = [];
	const disabledSkillSet = new Set(context.disabledSkills);
	for (const candidate of candidates) {
		if (candidate.confidence === "low") {
			skipped.push({ skillId: candidate.skillId, routeId: candidate.routeIds[0], reason: "low-confidence route evidence is considered but not selected unless reinforced", evidence: candidate.evidence, confidence: candidate.confidence });
			continue;
		}
		if (baselineById.has(candidate.skillId)) {
			const baselineSelection = baselineById.get(candidate.skillId)!;
			baselineSelection.routeIds = [...new Set([...baselineSelection.routeIds, ...candidate.routeIds])];
			baselineSelection.evidence = [...new Set([...baselineSelection.evidence, ...candidate.evidence])];
			baselineSelection.rationale = [...new Set([...baselineSelection.rationale, ...candidate.rationale])];
			baselineSelection.confidence = CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[baselineSelection.confidence] ? candidate.confidence : baselineSelection.confidence;
			continue;
		}
		if (disabledSkillSet.has(candidate.skillId)) {
			skipped.push({ skillId: candidate.skillId, routeId: candidate.routeIds[0], reason: "skill disabled by repo disabledSkills", evidence: candidate.evidence, confidence: candidate.confidence });
			continue;
		}
		const existing = routedById.get(candidate.skillId);
		if (!existing) {
			routedById.set(candidate.skillId, candidate);
			continue;
		}
		if (CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[existing.confidence]) existing.confidence = candidate.confidence;
		existing.routeIds = [...new Set([...existing.routeIds, ...candidate.routeIds])];
		existing.evidence = [...new Set([...existing.evidence, ...candidate.evidence])];
		existing.rationale = [...new Set([...existing.rationale, ...candidate.rationale])];
		existing.order = Math.min(existing.order, candidate.order);
	}

	for (const selection of [...baseline, ...routedById.values()]) {
		if (!selection.available) {
			selectionDiagnostics.push({
				severity: "error",
				code: selection.baseline ? "missing-baseline-skill" : "missing-routed-skill",
				message: `${selection.baseline ? "Baseline" : "Routed"} skill '${selection.skillId}' is missing at ${selection.absolutePath}.`,
			});
		}
	}

	const sorted = sortedSelections([...routedById.values()]);
	const limit = role === "worker" ? context.limits.workerMaxRoutedSkills : context.limits.reviewMaxRoutedSkills;
	const highCount = sorted.filter((item) => item.confidence === "high").length;
	const overflowHighConfidence = highCount > limit;
	let routed = sorted;
	if (overflowHighConfidence) {
		for (const selection of sorted.filter((item) => item.confidence === "high")) {
			skipped.push({ skillId: selection.skillId, routeId: selection.routeIds[0], reason: `${role} high-confidence routed skills exceed cap ${limit}; automation must stop for re-slicing`, evidence: selection.evidence, confidence: selection.confidence });
		}
	} else {
		routed = sorted.slice(0, limit);
		for (const selection of sorted.slice(limit)) {
			skipped.push({ skillId: selection.skillId, routeId: selection.routeIds[0], reason: `${role} routed skill cap ${limit} reached; medium/low confidence selection skipped`, evidence: selection.evidence, confidence: selection.confidence });
		}
	}

	return { role, baseline, routed, skipped, overflowHighConfidence };
}

export function routeIssue(context: RoutingContext, issue: IssueEvidence): RouteResult {
	const considered: ConsideredRoute[] = [];
	const candidatesByRole: Record<AgentRole, SkillSelection[]> = { worker: [], review: [] };
	const selectionDiagnostics: ValidationDiagnostic[] = [];
	for (const route of context.routes) {
		const evidence = routeEvidence(route, issue);
		const matched = evidence.length > 0;
		const baseConfidence = route.confidence ?? "medium";
		const confidence = promoteConfidence(baseConfidence, matchedFieldCount(evidence));
		considered.push({
			routeId: route.id,
			matched,
			disabled: route.disabled,
			skillIds: route.skillIds,
			confidence,
			evidence,
			rationale: route.rationale,
		});
		if (!matched) continue;
		if (route.disabled) continue;
		for (const skillId of route.skillIds) {
			for (const role of ["worker", "review"] as AgentRole[]) {
				const selection = makeSelection(skillId, role, context, false, route.order);
				if (!selection) continue;
				selection.confidence = confidence;
				selection.routeIds = [route.id];
				selection.evidence = evidence;
				selection.rationale = [route.rationale];
				candidatesByRole[role].push(selection);
			}
		}
	}

	const worker = buildPack("worker", context, candidatesByRole.worker, selectionDiagnostics);
	const review = buildPack("review", context, candidatesByRole.review, selectionDiagnostics);
	if (worker.overflowHighConfidence) {
		selectionDiagnostics.push({ severity: "error", code: "worker-high-confidence-overflow", message: `Worker high-confidence routed skills exceed cap ${context.limits.workerMaxRoutedSkills}.` });
	}
	if (review.overflowHighConfidence) {
		selectionDiagnostics.push({ severity: "error", code: "review-high-confidence-overflow", message: `Review high-confidence routed skills exceed cap ${context.limits.reviewMaxRoutedSkills}.` });
	}
	const diagnostics = [...context.validation.diagnostics, ...selectionDiagnostics];
	return {
		issue,
		worker,
		review,
		considered,
		validation: { ok: diagnostics.length === 0, diagnostics },
		configPath: context.configPath,
		limits: context.limits,
	};
}
