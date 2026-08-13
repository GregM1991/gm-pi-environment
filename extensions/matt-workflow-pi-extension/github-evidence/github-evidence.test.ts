import { describe, expect, test } from "bun:test";
import { collectGithubEvidence, reconcileGithubEvidence } from "./index";
import type {
	GitHubEvidenceAdapter,
	GitHubEvidenceRequest,
	GitHubPage,
	GitHubReadResult,
	PullRequestIdentity,
} from "./types";

const HEAD = "a".repeat(40);
const NEXT_HEAD = "b".repeat(40);
const pullRequest: PullRequestIdentity = {
	owner: "octo",
	repo: "example",
	number: 42,
	url: "https://github.com/octo/example/pull/42",
	baseRef: "main",
	headSha: HEAD,
	reviewDecision: "changes-requested",
};

function page<T>(items: T[], nextCursor?: string, rateLimit?: GitHubPage<T>["rateLimit"]): GitHubReadResult<GitHubPage<T>> {
	return { status: "ok", value: { items, nextCursor, rateLimit } };
}

function adapter(overrides: Partial<GitHubEvidenceAdapter> = {}): GitHubEvidenceAdapter {
	return {
		readPullRequest: async () => ({ status: "ok", value: pullRequest }),
		readRequiredPolicy: async () => ({ status: "ok", value: { status: "available", requiredChecks: [{ name: "ci/test" }, { name: "legacy/lint" }] } }),
		readCheckRuns: async () => page([]),
		readLegacyStatuses: async () => page([]),
		readAnnotations: async () => page([]),
		readReviewSummaries: async () => page([]),
		readReviewThreads: async () => page([]),
		now: () => 0,
		wait: async () => "elapsed",
		...overrides,
	};
}

const request: GitHubEvidenceRequest = {
	pullRequest: { owner: "octo", repo: "example", number: 42 },
	expectedHeadSha: HEAD,
	configuredRequiredChecks: ["configured/check"],
	browser: { status: "pending", flows: ["Open settings and save"] },
	evidenceReferences: [".pi/matt-verification/42-initial.log"],
};

describe("normalized GitHub PR evidence", () => {
	test("keeps policy and observation surfaces distinct and emits only compact blocking evidence", async () => {
		const seenCursors: Array<string | undefined> = [];
		const annotatedCheckRunIds: number[] = [];
		const github = adapter({
			readCheckRuns: async (_pr, cursor) => {
				seenCursors.push(cursor);
				if (!cursor) {
					return page([
						{ id: 1, name: "ci/test", status: "completed", conclusion: "failure", detailsUrl: "https://checks/1", appId: 15368 },
						{ id: 2, name: "optional/docs", status: "completed", conclusion: "failure", detailsUrl: "https://checks/2" },
					], "next-checks");
				}
				return page([{ id: 3, name: "optional/pass", status: "completed", conclusion: "success", detailsUrl: "https://checks/3" }]);
			},
			readLegacyStatuses: async () => page([{ id: 4, context: "legacy/lint", state: "success", targetUrl: "https://statuses/4" }]),
			readAnnotations: async (_pr, checkRunId) => {
				annotatedCheckRunIds.push(checkRunId);
				if (checkRunId === 1) return page([
					{ id: 5, checkRunId: 1, path: "src/a.ts", startLine: 7, endLine: 7, level: "failure", message: "Expected string" },
					{ id: 6, checkRunId: 1, path: "src/a.ts", startLine: 8, endLine: 8, level: "notice", message: "Raw detail that is not blocking" },
				]);
				if (checkRunId === 2) return page([
					{ id: 9, checkRunId: 2, path: "docs/a.md", startLine: 1, endLine: 1, level: "failure", message: "Optional check detail" },
				]);
				return page([]);
			},
			readReviewSummaries: async () => page([
				{ id: 7, author: "reviewer", state: "changes-requested", body: "Please address the unresolved finding.", submittedAt: "2026-01-01T00:00:00Z", url: "https://reviews/7" },
				{ id: 8, author: "other", state: "approved", body: "Looks good", submittedAt: "2026-01-01T00:01:00Z", url: "https://reviews/8" },
			]),
			readReviewThreads: async () => page([
				{ id: "thread-1", path: "src/a.ts", line: 7, isResolved: false, isOutdated: false, comments: [
					{ id: "comment-1", author: "reviewer", body: "First message", createdAt: "2026-01-01T00:00:00Z", url: "https://comments/1" },
					{ id: "comment-2", author: "author", body: "Latest actionable reply", createdAt: "2026-01-01T00:01:00Z", url: "https://comments/2" },
				] },
				{ id: "thread-2", path: "src/old.ts", line: 1, isResolved: false, isOutdated: true, comments: [{ id: "comment-3", author: "reviewer", body: "Old", createdAt: "2026-01-01T00:00:00Z", url: "https://comments/3" }] },
			]),
		});

		const result = await collectGithubEvidence(github, request);

		expect(result.status).toBe("complete");
		if (result.status !== "complete") throw new Error("expected complete evidence");
		expect(seenCursors).toEqual([undefined, "next-checks"]);
		expect(annotatedCheckRunIds).toEqual([1, 2, 3]);
		expect(result.evidence.policy).toEqual({ source: "github", requiredChecks: [{ name: "ci/test" }, { name: "legacy/lint" }] });
		expect(result.evidence.observations.checkRuns).toHaveLength(3);
		expect(result.evidence.observations.legacyStatuses).toHaveLength(1);
		expect(result.evidence.observations.annotations).toHaveLength(3);
		expect(result.evidence.observations.reviewSummaries).toHaveLength(2);
		expect(result.evidence.observations.unresolvedActionableThreads).toHaveLength(1);
		expect(result.packet.blockingChecks.map((item) => item.name)).toEqual(["ci/test"]);
		expect(result.packet.blockingAnnotations.map((item) => item.message)).toEqual(["Expected string"]);
		expect(result.packet.blockingReviewSummaries.map((item) => item.author)).toEqual(["reviewer"]);
		expect(result.packet.actionableThreads).toEqual([expect.objectContaining({ id: "thread-1", feedback: "Latest actionable reply", commentCount: 2 })]);
		expect(JSON.stringify(result.packet)).not.toContain("First message");
		expect(JSON.stringify(result.packet)).not.toContain("optional/docs");
		expect(result.packet.browser).toEqual(request.browser);
		expect(result.packet.references).toEqual({
			evidence: [".pi/matt-verification/42-initial.log"],
			refresh: [
				"GET /repos/octo/example/pulls/42",
				"GET /repos/octo/example/branches/main/protection/required_status_checks",
				"GET /repos/octo/example/commits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/check-runs",
				"GET /repos/octo/example/commits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/status",
				"GET /repos/octo/example/check-runs/1/annotations",
				"GET /repos/octo/example/check-runs/2/annotations",
				"GET /repos/octo/example/check-runs/3/annotations",
				"GET /repos/octo/example/pulls/42/reviews",
				"GraphQL PullRequest.reviewThreads octo/example#42",
			],
		});
	});

	test("requires the matching GitHub App for app-bound native policy", async () => {
		const result = await collectGithubEvidence(adapter({
			readRequiredPolicy: async () => ({ status: "ok", value: { status: "available", requiredChecks: [{ name: "ci/test", appId: 15368 }] } }),
			readCheckRuns: async () => page([
				{ id: 1, name: "ci/test", appId: 999, status: "completed", conclusion: "success", detailsUrl: "https://checks/wrong-app" },
			]),
			readLegacyStatuses: async () => page([
				{ id: 2, context: "ci/test", state: "success", targetUrl: "https://statuses/same-name" },
			]),
		}), request);

		expect(result.status).toBe("complete");
		if (result.status !== "complete") throw new Error("expected complete evidence");
		expect(result.evidence.policy.requiredChecks).toEqual([{ name: "ci/test", appId: 15368 }]);
		expect(result.packet.blockingChecks).toEqual([
			expect.objectContaining({ name: "ci/test", appId: 15368, outcome: "pending", status: "not-reported" }),
		]);
	});

	test("keeps complete annotations while compacting only required blocking check annotations", async () => {
		const result = await collectGithubEvidence(adapter({
			readCheckRuns: async () => page([
				{ id: 1, name: "ci/test", status: "completed", conclusion: "success", detailsUrl: "https://checks/passing-required" },
				{ id: 2, name: "optional/docs", status: "completed", conclusion: "failure", detailsUrl: "https://checks/failing-optional" },
			]),
			readLegacyStatuses: async () => page([{ id: 3, context: "legacy/lint", state: "success", targetUrl: "https://statuses/3" }]),
			readAnnotations: async (_pr, checkRunId) => page([
				{ id: checkRunId, checkRunId, path: "src/a.ts", startLine: checkRunId, endLine: checkRunId, level: "failure", message: `annotation-${checkRunId}` },
			]),
		}), request);

		expect(result.status).toBe("complete");
		if (result.status !== "complete") throw new Error("expected complete evidence");
		expect(result.evidence.observations.annotations.map((item) => item.message)).toEqual(["annotation-1", "annotation-2"]);
		expect(result.packet.blockingAnnotations).toEqual([]);
	});

	test("uses only each reviewer's latest review when projecting actionable summaries", async () => {
		const result = await collectGithubEvidence(adapter({
			readReviewSummaries: async () => page([
				{ id: 1, author: "Reviewer", state: "changes-requested", body: "Please fix", submittedAt: "2026-01-01T00:00:00Z", url: "https://reviews/1" },
				{ id: 2, author: "other", state: "changes-requested", body: "Still blocked", submittedAt: "2026-01-01T00:02:00Z", url: "https://reviews/2" },
				{ id: 3, author: "reviewer", state: "approved", body: "Resolved", submittedAt: "2026-01-01T00:03:00Z", url: "https://reviews/3" },
			]),
		}), request);

		expect(result.status).toBe("complete");
		if (result.status !== "complete") throw new Error("expected complete evidence");
		expect(result.evidence.observations.reviewSummaries).toHaveLength(3);
		expect(result.packet.blockingReviewSummaries.map((item) => item.author)).toEqual(["other"]);
	});

	test("uses configured policy only when native policy is missing and hard-stops when both are missing", async () => {
		const nativeMissing = adapter({ readRequiredPolicy: async () => ({ status: "ok", value: { status: "missing" } }) });
		const configured = await collectGithubEvidence(nativeMissing, request);
		expect(configured.status).toBe("complete");
		if (configured.status === "complete") expect(configured.evidence.policy).toEqual({ source: "configured", requiredChecks: [{ name: "configured/check" }] });

		const missing = await collectGithubEvidence(nativeMissing, { ...request, configuredRequiredChecks: undefined });
		expect(missing).toEqual(expect.objectContaining({ status: "hard-stop", reason: "missing-required-check-policy" }));
		if (configured.status === "complete") {
			expect(configured.packet.blockingChecks).toEqual([expect.objectContaining({ name: "configured/check", outcome: "pending", status: "not-reported" })]);
		}
	});

	test("returns explicit permission, stale-head, pagination, rate-limit, and unknown outcomes", async () => {
		const denied = await collectGithubEvidence(adapter({ readRequiredPolicy: async () => ({ status: "error", kind: "permission", message: "Resource not accessible" }) }), request);
		expect(denied).toEqual(expect.objectContaining({ status: "permission-denied", operation: "required-policy" }));

		const stale = await collectGithubEvidence(adapter({ readPullRequest: async () => ({ status: "ok", value: { ...pullRequest, headSha: NEXT_HEAD } }) }), request);
		expect(stale).toEqual(expect.objectContaining({ status: "stale-head", expectedHeadSha: HEAD, observedHeadSha: NEXT_HEAD }));
		let pullReads = 0;
		const changedDuringRead = await collectGithubEvidence(adapter({
			readPullRequest: async () => ({ status: "ok", value: { ...pullRequest, headSha: pullReads++ === 0 ? HEAD : NEXT_HEAD } }),
		}), request);
		expect(changedDuringRead).toEqual(expect.objectContaining({ status: "stale-head", expectedHeadSha: HEAD, observedHeadSha: NEXT_HEAD }));

		const paginated = await collectGithubEvidence(adapter({ readCheckRuns: async () => page([], "still-more") }), { ...request, maxPagesPerSurface: 2 });
		expect(paginated).toEqual(expect.objectContaining({ status: "unknown", reason: "pagination-limit", operation: "check-runs" }));
		const rateLimited = await collectGithubEvidence(adapter({
			readCheckRuns: async () => page([], "next", { remaining: 0, resetAt: 123_000, retryAfterMs: 60_000 }),
		}), request);
		expect(rateLimited).toEqual(expect.objectContaining({ status: "rate-limited", operation: "check-runs", resetAt: 123_000, retryAfterMs: 60_000 }));

		const unknown = await collectGithubEvidence(adapter({ readReviewThreads: async () => ({ status: "error", kind: "unknown", message: "unexpected response" }) }), request);
		expect(unknown).toEqual(expect.objectContaining({ status: "unknown", reason: "adapter-error", operation: "review-threads" }));
	});

	test("reconciles pending checks on the approved cadence and stops when they settle", async () => {
		let now = 0;
		let reads = 0;
		const waits: number[] = [];
		const github = adapter({
			now: () => now,
			readCheckRuns: async () => page([{ id: 1, name: "ci/test", status: reads++ < 3 ? "in-progress" : "completed", conclusion: reads <= 3 ? null : "success", detailsUrl: "https://checks/1" }]),
			readLegacyStatuses: async () => page([{ id: 2, context: "legacy/lint", state: "success", targetUrl: "https://statuses/2" }]),
			wait: async ({ delayMs }) => { waits.push(delayMs); now += delayMs; return "elapsed"; },
		});

		const result = await reconcileGithubEvidence(github, request, { headStartedAt: 0, transactionStartedAt: 0 });

		expect(result.status).toBe("settled");
		expect(waits).toEqual([15_000, 15_000, 15_000]);
	});

	test("honors rate-limit reset without exceeding the wait budget", async () => {
		let now = 0;
		let limited = true;
		const waits: number[] = [];
		const github = adapter({
			now: () => now,
			readCheckRuns: async () => {
				if (limited) return { status: "error", kind: "rate-limit", message: "secondary limit", retryAfterMs: 60_000, resetAt: 60_000 };
				return page([
					{ id: 1, name: "ci/test", status: "completed", conclusion: "success", detailsUrl: "https://checks/1" },
				]);
			},
			readLegacyStatuses: async () => page([{ id: 2, context: "legacy/lint", state: "success", targetUrl: "https://statuses/2" }]),
			wait: async ({ delayMs }) => { waits.push(delayMs); now += delayMs; limited = false; return "wakeup"; },
		});

		const result = await reconcileGithubEvidence(github, request, { headStartedAt: 0, transactionStartedAt: 0 });

		expect(result.status).toBe("settled");
		expect(waits).toEqual([60_000]);
	});

	test("enforces per-head and transaction limits and reports pending checks on timeout", async () => {
		let now = 29 * 60_000 + 55_000;
		const waits: number[] = [];
		const github = adapter({
			now: () => now,
			readCheckRuns: async () => page([{ id: 1, name: "ci/test", status: "in-progress", conclusion: null, detailsUrl: "https://checks/1" }]),
			readLegacyStatuses: async () => page([{ id: 2, context: "legacy/lint", state: "success", targetUrl: "https://statuses/2" }]),
			wait: async ({ delayMs }) => { waits.push(delayMs); now += delayMs; return "elapsed"; },
		});

		const headTimeout = await reconcileGithubEvidence(github, request, { headStartedAt: 0, transactionStartedAt: 0 });
		expect(headTimeout.status).toBe("timeout");
		if (headTimeout.status === "timeout") {
			expect(headTimeout.limit).toBe("head");
			expect(headTimeout.packet.blockingChecks).toEqual([expect.objectContaining({ name: "ci/test", outcome: "pending" })]);
			expect(headTimeout.packet.blockingChecks.some((item) => item.outcome === "failed")).toBe(false);
		}
		expect(waits).toEqual([5_000]);

		now = 29 * 60_000 + 55_000;
		waits.length = 0;
		const clampedHeadTimeout = await reconcileGithubEvidence(github, request, {
			headStartedAt: 0,
			transactionStartedAt: 0,
			perHeadLimitMs: 60 * 60_000,
			transactionLimitMs: 180 * 60_000,
		});
		expect(clampedHeadTimeout).toEqual(expect.objectContaining({ status: "timeout", limit: "head" }));
		expect(waits).toEqual([5_000]);

		now = 90 * 60_000;
		const transactionTimeout = await reconcileGithubEvidence(adapter({ ...github, now: () => now }), request, {
			headStartedAt: 89 * 60_000,
			transactionStartedAt: 0,
			transactionLimitMs: 180 * 60_000,
		});
		expect(transactionTimeout).toEqual(expect.objectContaining({ status: "timeout", limit: "transaction" }));
	});
});
