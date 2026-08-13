export type PullRequestRef = {
	owner: string;
	repo: string;
	number: number;
};

export type ReviewDecision = "approved" | "changes-requested" | "review-required" | "unknown";

export type PullRequestIdentity = PullRequestRef & {
	url: string;
	baseRef: string;
	headSha: string;
	reviewDecision: ReviewDecision;
};

export type RateLimit = {
	remaining?: number;
	resetAt?: number;
	retryAfterMs?: number;
};

export type GitHubPage<T> = {
	items: T[];
	nextCursor?: string;
	rateLimit?: RateLimit;
};

export type GitHubReadResult<T> =
	| { status: "ok"; value: T }
	| { status: "error"; kind: "permission" | "rate-limit" | "timeout" | "unknown"; message: string; retryAfterMs?: number; resetAt?: number };

export type RequiredCheck = {
	name: string;
	appId?: number;
};

export type NativeRequiredPolicy =
	| { status: "available"; requiredChecks: RequiredCheck[] }
	| { status: "missing" };

export type CheckRun = {
	id: number;
	name: string;
	appId?: number;
	status: "queued" | "in-progress" | "completed" | "unknown";
	conclusion: "success" | "failure" | "neutral" | "skipped" | "timed-out" | "action-required" | "cancelled" | "unknown" | null;
	detailsUrl: string;
};

export type LegacyStatus = {
	id: number;
	context: string;
	state: "success" | "failure" | "error" | "pending" | "unknown";
	description?: string;
	targetUrl: string;
};

export type CheckAnnotation = {
	id: number;
	checkRunId: number;
	path: string;
	startLine: number;
	endLine: number;
	level: "failure" | "warning" | "notice" | "unknown";
	message: string;
	detailsUrl?: string;
};

export type ReviewSummary = {
	id: number;
	author: string;
	state: "approved" | "changes-requested" | "commented" | "dismissed" | "pending" | "unknown";
	body: string;
	submittedAt: string;
	url: string;
};

export type ReviewThreadComment = {
	id: string;
	author: string;
	body: string;
	createdAt: string;
	url: string;
};

export type ReviewThread = {
	id: string;
	path?: string;
	line?: number;
	isResolved: boolean;
	isOutdated: boolean;
	comments: ReviewThreadComment[];
};

export type WaitRequest = {
	delayMs: number;
	reason: "poll" | "rate-limit";
	deadline: number;
};

export type GitHubEvidenceAdapter = {
	readPullRequest(ref: PullRequestRef): Promise<GitHubReadResult<PullRequestIdentity>>;
	readRequiredPolicy(pr: PullRequestIdentity): Promise<GitHubReadResult<NativeRequiredPolicy>>;
	readCheckRuns(pr: PullRequestIdentity, cursor?: string): Promise<GitHubReadResult<GitHubPage<CheckRun>>>;
	readLegacyStatuses(pr: PullRequestIdentity, cursor?: string): Promise<GitHubReadResult<GitHubPage<LegacyStatus>>>;
	readAnnotations(pr: PullRequestIdentity, checkRunId: number, cursor?: string): Promise<GitHubReadResult<GitHubPage<CheckAnnotation>>>;
	readReviewSummaries(pr: PullRequestIdentity, cursor?: string): Promise<GitHubReadResult<GitHubPage<ReviewSummary>>>;
	readReviewThreads(pr: PullRequestIdentity, cursor?: string): Promise<GitHubReadResult<GitHubPage<ReviewThread>>>;
	now(): number;
	wait(request: WaitRequest): Promise<"elapsed" | "wakeup">;
};

export type BrowserEvidence = {
	status: "not-required" | "pending" | "passed" | "failed";
	flows?: string[];
	reference?: string;
};

export type GitHubEvidenceRequest = {
	pullRequest: PullRequestRef;
	expectedHeadSha?: string;
	configuredRequiredChecks?: string[];
	browser?: BrowserEvidence;
	evidenceReferences?: string[];
	maxPagesPerSurface?: number;
};

export type RequiredPolicy = {
	source: "github" | "configured";
	requiredChecks: RequiredCheck[];
};

export type GithubObservations = {
	checkRuns: CheckRun[];
	legacyStatuses: LegacyStatus[];
	annotations: CheckAnnotation[];
	reviewSummaries: ReviewSummary[];
	unresolvedActionableThreads: ReviewThread[];
};

export type NormalizedGithubEvidence = {
	pullRequest: PullRequestIdentity;
	policy: RequiredPolicy;
	observations: GithubObservations;
};

export type BlockingCheck = {
	kind: "check-run" | "legacy-status";
	name: string;
	appId?: number;
	outcome: "failed" | "pending" | "unknown";
	status: string;
	detailsUrl: string;
};

export type CompactGithubEvidencePacket = {
	pullRequest: PullRequestIdentity;
	policy: RequiredPolicy;
	blockingChecks: BlockingCheck[];
	blockingAnnotations: CheckAnnotation[];
	blockingReviewSummaries: ReviewSummary[];
	actionableThreads: Array<{
		id: string;
		path?: string;
		line?: number;
		feedback: string;
		author?: string;
		url?: string;
		commentCount: number;
	}>;
	browser?: BrowserEvidence;
	references: {
		evidence: string[];
		refresh: string[];
	};
};

export type GithubEvidenceFailure =
	| { status: "hard-stop"; reason: "missing-required-check-policy"; message: string }
	| { status: "permission-denied"; operation: string; message: string }
	| { status: "stale-head"; expectedHeadSha: string; observedHeadSha: string; pullRequest: PullRequestIdentity }
	| { status: "rate-limited"; operation: string; message: string; retryAfterMs?: number; resetAt?: number }
	| { status: "unknown"; reason: "adapter-error" | "pagination-limit" | "timeout"; operation: string; message: string };

export type GithubEvidenceResult =
	| { status: "complete"; evidence: NormalizedGithubEvidence; packet: CompactGithubEvidencePacket }
	| GithubEvidenceFailure;

export type ReconciliationBudget = {
	headStartedAt: number;
	transactionStartedAt: number;
	perHeadLimitMs?: number;
	transactionLimitMs?: number;
};

export type ReconciliationResult =
	| { status: "settled"; evidence: NormalizedGithubEvidence; packet: CompactGithubEvidencePacket; attempts: number }
	| { status: "timeout"; limit: "head" | "transaction"; packet: CompactGithubEvidencePacket; attempts: number; pendingChecks: string[] }
	| GithubEvidenceFailure;
