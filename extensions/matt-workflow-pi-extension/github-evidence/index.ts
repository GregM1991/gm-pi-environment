import type {
	BlockingCheck,
	CheckAnnotation,
	CheckRun,
	CompactGithubEvidencePacket,
	GitHubEvidenceAdapter,
	GithubEvidenceFailure,
	GithubEvidenceRequest,
	GithubEvidenceResult,
	GitHubPage,
	GitHubReadResult,
	LegacyStatus,
	NormalizedGithubEvidence,
	PullRequestIdentity,
	ReconciliationBudget,
	ReconciliationResult,
	RequiredCheck,
	RequiredPolicy,
	ReviewSummary,
	ReviewThread,
} from "./types";

const DEFAULT_MAX_PAGES = 100;
const PER_HEAD_LIMIT_MS = 30 * 60_000;
const TRANSACTION_LIMIT_MS = 90 * 60_000;

function readFailure(operation: string, result: Exclude<GitHubReadResult<unknown>, { status: "ok" }>): GithubEvidenceFailure {
	if (result.kind === "permission") return { status: "permission-denied", operation, message: result.message };
	if (result.kind === "rate-limit") {
		return {
			status: "rate-limited",
			operation,
			message: result.message,
			...(result.retryAfterMs !== undefined ? { retryAfterMs: result.retryAfterMs } : {}),
			...(result.resetAt !== undefined ? { resetAt: result.resetAt } : {}),
		};
	}
	return {
		status: "unknown",
		reason: result.kind === "timeout" ? "timeout" : "adapter-error",
		operation,
		message: result.message,
	};
}

async function readAllPages<T>(
	operation: string,
	maxPages: number,
	readPage: (cursor?: string) => Promise<GitHubReadResult<GitHubPage<T>>>,
): Promise<{ status: "ok"; items: T[] } | GithubEvidenceFailure> {
	const items: T[] = [];
	let cursor: string | undefined;
	const seenCursors = new Set<string>();
	for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
		const result = await readPage(cursor);
		if (result.status === "error") return readFailure(operation, result);
		items.push(...result.value.items);
		const next = result.value.nextCursor;
		if (!next) return { status: "ok", items };
		if (result.value.rateLimit?.remaining === 0) {
			return {
				status: "rate-limited",
				operation,
				message: `${operation} pagination paused because GitHub reported no remaining requests.`,
				...(result.value.rateLimit.retryAfterMs !== undefined ? { retryAfterMs: result.value.rateLimit.retryAfterMs } : {}),
				...(result.value.rateLimit.resetAt !== undefined ? { resetAt: result.value.rateLimit.resetAt } : {}),
			};
		}
		if (seenCursors.has(next)) {
			return { status: "unknown", reason: "pagination-limit", operation, message: `${operation} pagination repeated cursor '${next}'.` };
		}
		seenCursors.add(next);
		cursor = next;
	}
	return { status: "unknown", reason: "pagination-limit", operation, message: `${operation} exceeded the ${maxPages}-page safety limit.` };
}

function resolvePolicy(native: { status: "available"; requiredChecks: RequiredCheck[] } | { status: "missing" }, configured?: string[]): RequiredPolicy | GithubEvidenceFailure {
	if (native.status === "available") return { source: "github", requiredChecks: native.requiredChecks.map((required) => ({ ...required })) };
	if (configured && configured.length > 0) return { source: "configured", requiredChecks: configured.map((name) => ({ name })) };
	return {
		status: "hard-stop",
		reason: "missing-required-check-policy",
		message: "Delivery requires native GitHub required-check policy or configured required checks.",
	};
}

function checkRunOutcome(checkRun: CheckRun): BlockingCheck["outcome"] | "passing" {
	if (checkRun.status !== "completed" || checkRun.conclusion === null) return checkRun.status === "unknown" ? "unknown" : "pending";
	if (["success", "neutral", "skipped"].includes(checkRun.conclusion)) return "passing";
	if (["failure", "timed-out", "action-required", "cancelled"].includes(checkRun.conclusion)) return "failed";
	return "unknown";
}

function legacyStatusOutcome(status: LegacyStatus): BlockingCheck["outcome"] | "passing" {
	if (status.state === "success") return "passing";
	if (status.state === "pending") return "pending";
	if (status.state === "failure" || status.state === "error") return "failed";
	return "unknown";
}

function checkRunMatches(required: RequiredCheck, checkRun: CheckRun): boolean {
	return checkRun.name === required.name && (required.appId === undefined || checkRun.appId === required.appId);
}

function legacyStatusMatches(required: RequiredCheck, status: LegacyStatus): boolean {
	return required.appId === undefined && status.context === required.name;
}

function compactPacket(evidence: NormalizedGithubEvidence, request: GithubEvidenceRequest): CompactGithubEvidencePacket {
	const blockingChecks: BlockingCheck[] = [];
	const blockingCheckRunIds = new Set<number>();
	for (const required of evidence.policy.requiredChecks) {
		const matchingRuns = evidence.observations.checkRuns.filter((checkRun) => checkRunMatches(required, checkRun));
		const matchingStatuses = evidence.observations.legacyStatuses.filter((status) => legacyStatusMatches(required, status));
		for (const checkRun of matchingRuns) {
			const outcome = checkRunOutcome(checkRun);
			if (outcome === "passing") continue;
			blockingCheckRunIds.add(checkRun.id);
			blockingChecks.push({ kind: "check-run", name: required.name, ...(required.appId !== undefined ? { appId: required.appId } : {}), outcome, status: checkRun.conclusion ?? checkRun.status, detailsUrl: checkRun.detailsUrl });
		}
		for (const status of matchingStatuses) {
			const outcome = legacyStatusOutcome(status);
			if (outcome === "passing") continue;
			blockingChecks.push({ kind: "legacy-status", name: required.name, outcome, status: status.state, detailsUrl: status.targetUrl });
		}
		if (matchingRuns.length === 0 && matchingStatuses.length === 0) {
			blockingChecks.push({ kind: "check-run", name: required.name, ...(required.appId !== undefined ? { appId: required.appId } : {}), outcome: "pending", status: "not-reported", detailsUrl: evidence.pullRequest.url });
		}
	}

	const repository = `${evidence.pullRequest.owner}/${evidence.pullRequest.repo}`;
	const refresh = [
		`GET /repos/${repository}/pulls/${evidence.pullRequest.number}`,
		`GET /repos/${repository}/branches/${encodeURIComponent(evidence.pullRequest.baseRef)}/protection/required_status_checks`,
		`GET /repos/${repository}/commits/${evidence.pullRequest.headSha}/check-runs`,
		`GET /repos/${repository}/commits/${evidence.pullRequest.headSha}/status`,
		...evidence.observations.checkRuns.map((checkRun) => `GET /repos/${repository}/check-runs/${checkRun.id}/annotations`),
		`GET /repos/${repository}/pulls/${evidence.pullRequest.number}/reviews`,
		`GraphQL PullRequest.reviewThreads ${repository}#${evidence.pullRequest.number}`,
	];

	return {
		pullRequest: evidence.pullRequest,
		policy: evidence.policy,
		blockingChecks,
		blockingAnnotations: evidence.observations.annotations.filter((annotation) => blockingCheckRunIds.has(annotation.checkRunId) && (annotation.level === "failure" || annotation.level === "warning")),
		blockingReviewSummaries: [...evidence.observations.reviewSummaries]
			.sort((left, right) => left.submittedAt.localeCompare(right.submittedAt) || left.id - right.id)
			.reduce((latest, summary) => latest.set(summary.author.toLowerCase(), summary), new Map<string, ReviewSummary>())
			.values()
			.filter((summary) => summary.state === "changes-requested")
			.toArray(),
		actionableThreads: evidence.observations.unresolvedActionableThreads.map((thread) => {
			const lastComment = thread.comments.at(-1);
			return {
				id: thread.id,
				...(thread.path !== undefined ? { path: thread.path } : {}),
				...(thread.line !== undefined ? { line: thread.line } : {}),
				feedback: lastComment?.body ?? "Unresolved review thread",
				...(lastComment ? { author: lastComment.author, url: lastComment.url } : {}),
				commentCount: thread.comments.length,
			};
		}),
		...(request.browser ? { browser: request.browser } : {}),
		references: { evidence: [...(request.evidenceReferences ?? [])], refresh },
	};
}

async function collectAnnotations(
	adapter: GitHubEvidenceAdapter,
	pullRequest: PullRequestIdentity,
	checkRuns: CheckRun[],
	maxPages: number,
): Promise<{ status: "ok"; items: CheckAnnotation[] } | GithubEvidenceFailure> {
	const items: CheckAnnotation[] = [];
	for (const checkRun of checkRuns) {
		const result = await readAllPages("annotations", maxPages, (cursor) => adapter.readAnnotations(pullRequest, checkRun.id, cursor));
		if (result.status !== "ok") return result;
		items.push(...result.items);
	}
	return { status: "ok", items };
}

export async function collectGithubEvidence(adapter: GitHubEvidenceAdapter, request: GithubEvidenceRequest): Promise<GithubEvidenceResult> {
	const maxPages = request.maxPagesPerSurface ?? DEFAULT_MAX_PAGES;
	const pullRequestResult = await adapter.readPullRequest(request.pullRequest);
	if (pullRequestResult.status === "error") return readFailure("pull-request", pullRequestResult);
	const pullRequest = pullRequestResult.value;
	if (request.expectedHeadSha && pullRequest.headSha !== request.expectedHeadSha) {
		return { status: "stale-head", expectedHeadSha: request.expectedHeadSha, observedHeadSha: pullRequest.headSha, pullRequest };
	}

	const nativePolicyResult = await adapter.readRequiredPolicy(pullRequest);
	if (nativePolicyResult.status === "error") return readFailure("required-policy", nativePolicyResult);
	const policy = resolvePolicy(nativePolicyResult.value, request.configuredRequiredChecks);
	if ("status" in policy) return policy;

	const checkRuns = await readAllPages("check-runs", maxPages, (cursor) => adapter.readCheckRuns(pullRequest, cursor));
	if (checkRuns.status !== "ok") return checkRuns;
	const legacyStatuses = await readAllPages("legacy-statuses", maxPages, (cursor) => adapter.readLegacyStatuses(pullRequest, cursor));
	if (legacyStatuses.status !== "ok") return legacyStatuses;
	const annotations = await collectAnnotations(adapter, pullRequest, checkRuns.items, maxPages);
	if (annotations.status !== "ok") return annotations;
	const reviewSummaries = await readAllPages("review-summaries", maxPages, (cursor) => adapter.readReviewSummaries(pullRequest, cursor));
	if (reviewSummaries.status !== "ok") return reviewSummaries;
	const reviewThreads = await readAllPages("review-threads", maxPages, (cursor) => adapter.readReviewThreads(pullRequest, cursor));
	if (reviewThreads.status !== "ok") return reviewThreads;
	const refreshedPullRequest = await adapter.readPullRequest(request.pullRequest);
	if (refreshedPullRequest.status === "error") return readFailure("pull-request-refresh", refreshedPullRequest);
	if (refreshedPullRequest.value.headSha !== pullRequest.headSha) {
		return {
			status: "stale-head",
			expectedHeadSha: pullRequest.headSha,
			observedHeadSha: refreshedPullRequest.value.headSha,
			pullRequest: refreshedPullRequest.value,
		};
	}

	const evidence: NormalizedGithubEvidence = {
		pullRequest,
		policy,
		observations: {
			checkRuns: checkRuns.items,
			legacyStatuses: legacyStatuses.items,
			annotations: annotations.items,
			reviewSummaries: reviewSummaries.items,
			unresolvedActionableThreads: reviewThreads.items.filter((thread) => !thread.isResolved && !thread.isOutdated),
		},
	};
	return { status: "complete", evidence, packet: compactPacket(evidence, request) };
}

function pollingDelay(elapsedMs: number): number {
	if (elapsedMs < 2 * 60_000) return 15_000;
	if (elapsedMs < 10 * 60_000) return 30_000;
	return 60_000;
}

function deadline(now: number, budget: ReconciliationBudget): { at: number; limit: "head" | "transaction" } {
	const head = budget.headStartedAt + Math.min(budget.perHeadLimitMs ?? PER_HEAD_LIMIT_MS, PER_HEAD_LIMIT_MS);
	const transaction = budget.transactionStartedAt + Math.min(budget.transactionLimitMs ?? TRANSACTION_LIMIT_MS, TRANSACTION_LIMIT_MS);
	if (transaction <= head) return { at: Math.max(now, transaction), limit: "transaction" };
	return { at: Math.max(now, head), limit: "head" };
}

function timeoutResult(result: Extract<GithubEvidenceResult, { status: "complete" }>, limit: "head" | "transaction", attempts: number): ReconciliationResult {
	const pendingChecks = result.packet.blockingChecks.filter((item) => item.outcome === "pending").map((item) => item.name);
	return { status: "timeout", limit, packet: result.packet, attempts, pendingChecks };
}

export async function reconcileGithubEvidence(
	adapter: GitHubEvidenceAdapter,
	request: GithubEvidenceRequest,
	budget: ReconciliationBudget,
): Promise<ReconciliationResult> {
	let attempts = 0;
	let lastComplete: Extract<GithubEvidenceResult, { status: "complete" }> | undefined;
	while (true) {
		attempts += 1;
		const result = await collectGithubEvidence(adapter, request);
		const currentDeadline = deadline(adapter.now(), budget);
		if (result.status === "rate-limited") {
			const now = adapter.now();
			if (now >= currentDeadline.at) {
				if (lastComplete) return timeoutResult(lastComplete, currentDeadline.limit, attempts);
				return { status: "unknown", reason: "timeout", operation: result.operation, message: `Rate-limit wait exceeded the ${currentDeadline.limit} reconciliation budget.` };
			}
			const requestedWait = Math.max(result.retryAfterMs ?? 60_000, result.resetAt !== undefined ? result.resetAt - now : 0, 0);
			await adapter.wait({ delayMs: Math.min(requestedWait, currentDeadline.at - now), reason: "rate-limit", deadline: currentDeadline.at });
			continue;
		}
		if (result.status !== "complete") return result;
		lastComplete = result;
		if (result.packet.blockingChecks.every((item) => item.outcome !== "pending")) {
			return { status: "settled", evidence: result.evidence, packet: result.packet, attempts };
		}
		const now = adapter.now();
		if (now >= currentDeadline.at) return timeoutResult(result, currentDeadline.limit, attempts);
		const delayMs = Math.min(pollingDelay(now - budget.headStartedAt), currentDeadline.at - now);
		await adapter.wait({ delayMs, reason: "poll", deadline: currentDeadline.at });
	}
}

export type {
	GitHubEvidenceAdapter,
	GithubEvidenceRequest,
	GithubEvidenceResult,
	NormalizedGithubEvidence,
	ReconciliationBudget,
	ReconciliationResult,
} from "./types";
