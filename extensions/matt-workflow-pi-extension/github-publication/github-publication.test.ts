import { describe, expect, test } from "bun:test";
import { publishAiGateEvidence, publishReviewEvidence } from "./index";
import type {
	AiGateRunner,
	CheckRunInput,
	CreateReviewInput,
	GitHubChecksPublicationAdapter,
	GitHubReviewPublicationAdapter,
	RemoteCheckRun,
	RemoteReviewPublication,
	ReviewEvidencePublicationRequest,
} from "./types";

const SUBJECT = "a".repeat(40);
const EVIDENCE_HEAD = "b".repeat(40);
const RUN_ID = "00000000-0000-4000-8000-000000000010";
const FINDING_ID = "00000000-0000-4000-8000-000000000011";
const SUMMARY_PUBLICATION_ID = "00000000-0000-4000-8000-000000000012";
const FINDING_PUBLICATION_ID = "00000000-0000-4000-8000-000000000013";
const EXPECTED_APP = { appId: 12_345, slug: "matt-review-evidence" };
const FOREIGN_APP = { appId: 98_765, slug: "foreign-check-writer" };
const pullRequest = { owner: "octo", repo: "example", number: 42 };

const reviewRequest: ReviewEvidencePublicationRequest = {
	pullRequest,
	issue: 49,
	subjectSha: SUBJECT,
	runId: RUN_ID,
	verdict: "FIX",
	summary: "One correctness finding needs attention.",
	summaryPublicationId: SUMMARY_PUBLICATION_ID,
	findings: [{
		findingId: FINDING_ID,
		path: "src/example.ts",
		line: 12,
		body: "Handle the missing value before dereferencing it.",
		publicationId: FINDING_PUBLICATION_ID,
	}],
};

function reviewAdapter(overrides: Partial<GitHubReviewPublicationAdapter> = {}) {
	const publications: RemoteReviewPublication[] = [];
	const creates: CreateReviewInput[] = [];
	const adapter: GitHubReviewPublicationAdapter = {
		readReviewPublications: async () => ({ status: "ok", value: [...publications] }),
		createReview: async (_pr, input) => {
			creates.push(input);
			publications.push(
				{ surface: "pr-review-summary", externalKey: "review-700", url: "https://github/reviews/700", body: input.body },
				...input.comments.map((comment, index) => ({ surface: "pr-review-thread" as const, externalKey: `comment-${701 + index}`, url: `https://github/comments/${701 + index}`, body: comment.body })),
			);
			return { status: "ok", value: { accepted: true } };
		},
		wait: async () => {},
		...overrides,
	};
	return { adapter, publications, creates };
}

function checksAdapter(overrides: Partial<GitHubChecksPublicationAdapter> = {}) {
	const checks: RemoteCheckRun[] = [];
	const creates: CheckRunInput[] = [];
	const adapter: GitHubChecksPublicationAdapter = {
		readCapability: async () => ({ status: "ok", value: { credentialSource: "external", credentialType: "github-app", app: EXPECTED_APP, writePermissions: ["checks"] } }),
		readCheckRuns: async (_pr, headSha, name) => ({ status: "ok", value: checks.filter((check) => check.headSha === headSha && check.name === name) }),
		createCheckRun: async (_pr, input) => {
			creates.push(input);
			const { headSha, ...output } = input;
			checks.push({ id: 900 + checks.length, headSha, name: input.name, externalId: input.externalId, app: EXPECTED_APP, url: `https://github/checks/${900 + checks.length}`, output });
			return { status: "ok", value: { accepted: true } };
		},
		wait: async () => {},
		...overrides,
	};
	return { adapter, checks, creates };
}

function gateRunner(): { runner: AiGateRunner; calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		runner: {
			evaluate: async (subjectSha) => {
				calls.push(subjectSha);
				return {
					verdict: "FIX",
					summary: "The AI gate found one actionable issue.",
					findings: [{ findingId: FINDING_ID, path: "src/example.ts", startLine: 12, level: "failure", summary: "Missing value is dereferenced", details: "Guard the nullable input." }],
				};
			},
		},
	};
}

describe("GitHub review evidence publication", () => {
	test("publishes one native summary and finding thread, then returns ledger Publications only after confirmation", async () => {
		const github = reviewAdapter();
		const result = await publishReviewEvidence(github.adapter, reviewRequest);

		expect(result.status).toBe("published");
		expect(github.creates).toHaveLength(1);
		expect(github.creates[0]).toEqual(expect.objectContaining({ commitSha: SUBJECT, event: "COMMENT" }));
		expect(github.creates[0].body).toContain(`matt-review-run:${RUN_ID}`);
		expect(github.creates[0].comments[0].body).toContain(`matt-review-run:${RUN_ID}`);
		expect(github.creates[0].comments[0].body).toContain(`matt-review-finding:${FINDING_ID}`);
		if (result.status === "published") {
			expect(result.disposition).toBe("created");
			expect(result.publicationRecords).toEqual([
				expect.objectContaining({ publicationId: SUMMARY_PUBLICATION_ID, runId: RUN_ID, surface: "pr-review-summary", externalKey: "review-700" }),
				expect.objectContaining({ publicationId: FINDING_PUBLICATION_ID, runId: RUN_ID, findingId: FINDING_ID, surface: "pr-review-thread", externalKey: "comment-701" }),
			]);
		}
	});

	test("round-trips markers and reconciles a duplicate request without creating another review", async () => {
		const github = reviewAdapter();
		const first = await publishReviewEvidence(github.adapter, reviewRequest);
		const second = await publishReviewEvidence(github.adapter, reviewRequest);

		expect(first.status).toBe("published");
		expect(second).toEqual(expect.objectContaining({ status: "published", disposition: "reconciled" }));
		expect(github.creates).toHaveLength(1);
	});

	test("retries definitive transient failures but does not expose Publication records before confirmation", async () => {
		const github = reviewAdapter();
		const normalCreate = github.adapter.createReview;
		let attempts = 0;
		const waits: number[] = [];
		github.adapter.createReview = async (...args) => {
			attempts += 1;
			if (attempts === 1) return { status: "error", kind: "retryable", message: "service unavailable", retryAfterMs: 25 };
			return normalCreate(...args);
		};
		github.adapter.wait = async (delay) => { waits.push(delay); };

		const result = await publishReviewEvidence(github.adapter, { ...reviewRequest, maxAttempts: 2 });

		expect(result.status).toBe("published");
		expect(attempts).toBe(2);
		expect(waits).toEqual([25]);
	});

	test("reconciles an ambiguous mutation when GitHub contains the marked review", async () => {
		const github = reviewAdapter();
		const normalCreate = github.adapter.createReview;
		github.adapter.createReview = async (...args) => {
			await normalCreate(...args);
			return { status: "error", kind: "ambiguous", message: "connection closed after send" };
		};

		const result = await publishReviewEvidence(github.adapter, reviewRequest);

		expect(result).toEqual(expect.objectContaining({ status: "published", disposition: "reconciled" }));
		expect(github.creates).toHaveLength(1);
	});

	test("blocks on permission denial, unresolved ambiguous creation, and conflicting duplicate markers", async () => {
		const denied = reviewAdapter({ createReview: async () => ({ status: "error", kind: "permission", message: "Resource not accessible" }) });
		expect(await publishReviewEvidence(denied.adapter, reviewRequest)).toEqual(expect.objectContaining({ status: "blocked", reason: "permission-denied", operation: "create-review" }));

		const ambiguous = reviewAdapter({ createReview: async () => ({ status: "error", kind: "ambiguous", message: "connection closed" }) });
		expect(await publishReviewEvidence(ambiguous.adapter, reviewRequest)).toEqual(expect.objectContaining({ status: "blocked", reason: "ambiguous-outcome" }));

		const conflict = reviewAdapter({
			readReviewPublications: async () => ({ status: "ok", value: [
				{ surface: "pr-review-summary", externalKey: "one", body: `<!-- matt-review-run:${RUN_ID} -->` },
				{ surface: "pr-review-summary", externalKey: "two", body: `<!-- matt-review-run:${RUN_ID} -->` },
			] }),
		});
		expect(await publishReviewEvidence(conflict.adapter, reviewRequest)).toEqual(expect.objectContaining({ status: "blocked", reason: "duplicate-conflict" }));
	});
});

describe("GitHub AI-gate check publication", () => {
	test("executes inference once on the code Subject SHA and projects the same check onto the evidence head", async () => {
		const github = checksAdapter();
		const gate = gateRunner();
		const result = await publishAiGateEvidence(github.adapter, gate.runner, {
			pullRequest,
			issue: 49,
			runId: RUN_ID,
			subjectSha: SUBJECT,
			expectedApp: EXPECTED_APP,
			evidenceHeadSha: EVIDENCE_HEAD,
		});

		expect(result.status).toBe("published");
		expect(gate.calls).toEqual([SUBJECT]);
		expect(github.creates.map((check) => check.headSha)).toEqual([SUBJECT, EVIDENCE_HEAD]);
		expect(github.creates.map((check) => check.externalId)).toEqual([
			`matt-ai-gate:${RUN_ID}:${SUBJECT}`,
			`matt-ai-gate:${RUN_ID}:${SUBJECT}`,
		]);
		expect(github.creates[0]).toEqual(expect.objectContaining({ name: "matt/ai-gate", conclusion: "failure" }));
		expect(github.creates[0].annotations[0].rawDetails).toContain(`matt-review-finding:${FINDING_ID}`);
		expect(github.creates[1].annotations).toEqual(github.creates[0].annotations);
	});

	test("reconciles existing checks and later projects captured output without repeating inference", async () => {
		const github = checksAdapter();
		const gate = gateRunner();
		const request = { pullRequest, issue: 49, runId: RUN_ID, subjectSha: SUBJECT, expectedApp: EXPECTED_APP };

		expect((await publishAiGateEvidence(github.adapter, gate.runner, request)).status).toBe("published");
		expect((await publishAiGateEvidence(github.adapter, gate.runner, { ...request, evidenceHeadSha: EVIDENCE_HEAD })).status).toBe("published");
		expect((await publishAiGateEvidence(github.adapter, gate.runner, { ...request, evidenceHeadSha: EVIDENCE_HEAD })).status).toBe("published");
		expect(github.creates.map((check) => check.headSha)).toEqual([SUBJECT, EVIDENCE_HEAD]);
		expect(github.creates[1].annotations[0].rawDetails.match(/matt-review-finding/g)).toHaveLength(1);
		expect(gate.calls).toEqual([SUBJECT]);
	});

	test("rejects repository credentials, foreign Apps, and over-broad App permissions before inference or check writes", async () => {
		const capabilities = [
			{ credentialSource: "repository" as const, credentialType: "repository-token" as const, writePermissions: ["checks"] },
			{ credentialSource: "external" as const, credentialType: "github-app" as const, app: FOREIGN_APP, writePermissions: ["checks"] },
			{ credentialSource: "external" as const, credentialType: "github-app" as const, app: EXPECTED_APP, writePermissions: ["checks", "contents"] },
		];

		for (const capability of capabilities) {
			const github = checksAdapter({ readCapability: async () => ({ status: "ok", value: capability }) });
			const gate = gateRunner();
			const result = await publishAiGateEvidence(github.adapter, gate.runner, {
				pullRequest,
				issue: 49,
				runId: RUN_ID,
				subjectSha: SUBJECT,
				expectedApp: EXPECTED_APP,
			});

			expect(result).toEqual(expect.objectContaining({ status: "blocked", reason: "invalid-capability", operation: "checks-capability" }));
			expect(gate.calls).toEqual([]);
			expect(github.creates).toEqual([]);
		}
	});

	test("does not reconcile a matching check created by a foreign GitHub App", async () => {
		const github = checksAdapter();
		await publishAiGateEvidence(github.adapter, gateRunner().runner, {
			pullRequest,
			issue: 49,
			runId: RUN_ID,
			subjectSha: SUBJECT,
			expectedApp: EXPECTED_APP,
		});
		github.checks[0].app = FOREIGN_APP;
		const gate = gateRunner();

		const result = await publishAiGateEvidence(github.adapter, gate.runner, {
			pullRequest,
			issue: 49,
			runId: RUN_ID,
			subjectSha: SUBJECT,
			expectedApp: EXPECTED_APP,
		});

		expect(result).toEqual(expect.objectContaining({ status: "published", disposition: "created" }));
		expect(gate.calls).toEqual([SUBJECT]);
		expect(github.creates).toHaveLength(2);
		if (result.status === "published") expect(result.checks[0].app).toEqual(EXPECTED_APP);
	});

	test("blocks when all existing evidence-head output diverges from the captured Subject-SHA result", async () => {
		const github = checksAdapter();
		const request = { pullRequest, issue: 49, runId: RUN_ID, subjectSha: SUBJECT, expectedApp: EXPECTED_APP, evidenceHeadSha: EVIDENCE_HEAD };
		await publishAiGateEvidence(github.adapter, gateRunner().runner, request);
		github.checks[1].output = { ...github.checks[1].output!, title: "A different result" };
		const gate = gateRunner();

		const result = await publishAiGateEvidence(github.adapter, gate.runner, request);

		expect(result).toEqual(expect.objectContaining({ status: "blocked", reason: "duplicate-conflict", operation: "reconcile-check" }));
		expect(gate.calls).toEqual([]);
	});

	test("blocks a pre-existing evidence-head check whose conclusion, summary marker, annotations, or finding markers diverge", async () => {
		const divergences: Array<(check: RemoteCheckRun) => void> = [
			(check) => { check.output = { ...check.output!, conclusion: "success" }; },
			(check) => { check.output = { ...check.output!, summary: check.output!.summary.replace(SUBJECT, "c".repeat(40)) }; },
			(check) => { check.output = { ...check.output!, annotations: [{ ...check.output!.annotations[0], path: "src/other.ts" }] }; },
			(check) => { check.output = { ...check.output!, annotations: [{ ...check.output!.annotations[0], rawDetails: check.output!.annotations[0].rawDetails.replace(FINDING_ID, "00000000-0000-4000-8000-000000000099") }] }; },
		];

		for (const diverge of divergences) {
			const github = checksAdapter();
			const subjectRequest = { pullRequest, issue: 49, runId: RUN_ID, subjectSha: SUBJECT, expectedApp: EXPECTED_APP };
			await publishAiGateEvidence(github.adapter, gateRunner().runner, subjectRequest);
			const subjectCheck = github.checks[0];
			const evidenceCheck: RemoteCheckRun = {
				...subjectCheck,
				id: subjectCheck.id + 1,
				headSha: EVIDENCE_HEAD,
				output: { ...subjectCheck.output!, annotations: subjectCheck.output!.annotations.map((annotation) => ({ ...annotation })) },
			};
			diverge(evidenceCheck);
			github.checks.push(evidenceCheck);
			const gate = gateRunner();

			const result = await publishAiGateEvidence(github.adapter, gate.runner, { ...subjectRequest, evidenceHeadSha: EVIDENCE_HEAD });

			expect(result).toEqual(expect.objectContaining({ status: "blocked", reason: "duplicate-conflict", operation: "reconcile-check" }));
			expect(gate.calls).toEqual([]);
			expect(github.creates).toHaveLength(1);
		}
	});

	test("retries definitive check failures and reconciles before creating a duplicate", async () => {
		const github = checksAdapter();
		const normalCreate = github.adapter.createCheckRun;
		let attempts = 0;
		const waits: number[] = [];
		github.adapter.createCheckRun = async (...args) => {
			attempts += 1;
			if (attempts === 1) return { status: "error", kind: "retryable", message: "service unavailable", retryAfterMs: 20 };
			return normalCreate(...args);
		};
		github.adapter.wait = async (delay) => { waits.push(delay); };

		const result = await publishAiGateEvidence(github.adapter, gateRunner().runner, { pullRequest, issue: 49, runId: RUN_ID, subjectSha: SUBJECT, expectedApp: EXPECTED_APP, maxAttempts: 2 });

		expect(result.status).toBe("published");
		expect(attempts).toBe(2);
		expect(waits).toEqual([20]);
		expect(github.creates).toHaveLength(1);
	});

	test("blocks permission denial and unresolved ambiguous check creation", async () => {
		const denied = checksAdapter({ readCapability: async () => ({ status: "error", kind: "permission", message: "Checks denied" }) });
		expect(await publishAiGateEvidence(denied.adapter, gateRunner().runner, { pullRequest, issue: 49, runId: RUN_ID, subjectSha: SUBJECT, expectedApp: EXPECTED_APP })).toEqual(expect.objectContaining({ status: "blocked", reason: "permission-denied" }));

		const ambiguous = checksAdapter({ createCheckRun: async () => ({ status: "error", kind: "ambiguous", message: "connection closed" }) });
		expect(await publishAiGateEvidence(ambiguous.adapter, gateRunner().runner, { pullRequest, issue: 49, runId: RUN_ID, subjectSha: SUBJECT, expectedApp: EXPECTED_APP })).toEqual(expect.objectContaining({ status: "blocked", reason: "ambiguous-outcome" }));
	});
});
