import type { PullRequestRef } from "../github-evidence/types";
import type { ReviewLedgerPublicationRecord, ReviewLedgerVerdict } from "../review-ledger/schema";

export type GitHubMutationErrorKind = "permission" | "retryable" | "ambiguous" | "unknown";

export type GitHubMutationResult<T> =
	| { status: "ok"; value: T }
	| { status: "error"; kind: GitHubMutationErrorKind; message: string; retryAfterMs?: number };

export type ReviewFindingPublication = {
	findingId: string;
	path: string;
	line: number;
	body: string;
	publicationId: string;
};

export type ReviewEvidencePublicationRequest = {
	pullRequest: PullRequestRef;
	issue: number;
	subjectSha: string;
	runId: string;
	verdict: ReviewLedgerVerdict;
	summary: string;
	summaryPublicationId: string;
	findings: ReviewFindingPublication[];
	maxAttempts?: number;
};

export type RemoteReviewPublication = {
	surface: "pr-review-summary" | "pr-review-thread";
	externalKey: string;
	url?: string;
	body: string;
};

export type CreateReviewInput = {
	commitSha: string;
	body: string;
	event: "COMMENT";
	comments: Array<{ path: string; line: number; side: "RIGHT"; body: string }>;
};

export type GitHubReviewPublicationAdapter = {
	readReviewPublications(pullRequest: PullRequestRef): Promise<GitHubMutationResult<RemoteReviewPublication[]>>;
	createReview(pullRequest: PullRequestRef, input: CreateReviewInput): Promise<GitHubMutationResult<{ accepted: true }>>;
	wait(delayMs: number): Promise<void>;
};

export type ConfirmedPublicationRecord = Omit<ReviewLedgerPublicationRecord, "schemaVersion" | "date">;

export type ReviewEvidencePublicationResult =
	| { status: "published"; disposition: "created" | "reconciled"; publicationRecords: ConfirmedPublicationRecord[] }
	| { status: "blocked"; reason: "permission-denied" | "ambiguous-outcome" | "adapter-error" | "retry-exhausted" | "duplicate-conflict"; operation: string; message: string };

export type AiGateFinding = {
	findingId: string;
	path: string;
	startLine: number;
	endLine?: number;
	level: "failure" | "warning" | "notice";
	summary: string;
	details?: string;
};

export type AiGateEvaluation = {
	verdict: ReviewLedgerVerdict;
	summary: string;
	findings: AiGateFinding[];
};

export type AiGateRunner = {
	evaluate(subjectSha: string): Promise<AiGateEvaluation>;
};

export type GitHubAppIdentity = {
	appId: number;
	slug: string;
};

export type ChecksCapability = {
	credentialSource: "external" | "repository";
	credentialType: "github-app" | "repository-token";
	app?: GitHubAppIdentity;
	writePermissions: readonly string[];
};

export type CheckAnnotationInput = {
	path: string;
	startLine: number;
	endLine: number;
	level: "failure" | "warning" | "notice";
	message: string;
	rawDetails: string;
};

export type CheckRunInput = {
	name: string;
	headSha: string;
	externalId: string;
	status: "completed";
	conclusion: "success" | "failure" | "action-required";
	title: string;
	summary: string;
	annotations: CheckAnnotationInput[];
};

export type RemoteCheckRun = {
	id: number;
	headSha: string;
	name: string;
	externalId?: string;
	app: GitHubAppIdentity;
	url?: string;
	output?: Omit<CheckRunInput, "headSha">;
};

export type GitHubChecksPublicationAdapter = {
	readCapability(): Promise<GitHubMutationResult<ChecksCapability>>;
	readCheckRuns(pullRequest: PullRequestRef, headSha: string, name: string): Promise<GitHubMutationResult<RemoteCheckRun[]>>;
	createCheckRun(pullRequest: PullRequestRef, input: CheckRunInput): Promise<GitHubMutationResult<{ accepted: true }>>;
	wait(delayMs: number): Promise<void>;
};

export type AiGatePublicationRequest = {
	pullRequest: PullRequestRef;
	issue: number;
	runId: string;
	subjectSha: string;
	expectedApp: GitHubAppIdentity;
	evidenceHeadSha?: string;
	checkName?: string;
	maxAttempts?: number;
};

export type AiGatePublicationResult =
	| { status: "published"; disposition: "created" | "reconciled"; evaluation?: AiGateEvaluation; checks: RemoteCheckRun[] }
	| { status: "blocked"; reason: "invalid-capability" | "permission-denied" | "ambiguous-outcome" | "adapter-error" | "retry-exhausted" | "duplicate-conflict"; operation: string; message: string };
