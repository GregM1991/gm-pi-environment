import type {
	AiGateEvaluation,
	AiGatePublicationRequest,
	AiGatePublicationResult,
	AiGateRunner,
	CheckRunInput,
	ConfirmedPublicationRecord,
	GitHubAppIdentity,
	GitHubChecksPublicationAdapter,
	GitHubMutationResult,
	GitHubReviewPublicationAdapter,
	RemoteCheckRun,
	RemoteReviewPublication,
	ReviewEvidencePublicationRequest,
	ReviewEvidencePublicationResult,
} from "./types";

const UUID_V4_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 1_000;

function runMarker(runId: string): string {
	return `<!-- matt-review-run:${runId} -->`;
}

function findingMarker(findingId: string): string {
	return `<!-- matt-review-finding:${findingId} -->`;
}

function markedBody(body: string, ...markers: string[]): string {
	return `${body.trim()}\n\n${markers.join("\n")}`;
}

function markerValue(body: string, name: "run" | "finding"): string | undefined {
	const prefix = name === "run" ? "matt-review-run" : "matt-review-finding";
	return [...body.matchAll(new RegExp(`<!--\\s*${prefix}:(${UUID_V4_SOURCE})\\s*-->`, "g"))].at(-1)?.[1];
}

function blocked(
	operation: string,
	result: Exclude<GitHubMutationResult<unknown>, { status: "ok" }>,
): Extract<ReviewEvidencePublicationResult, { status: "blocked" }> {
	if (result.kind === "permission") return { status: "blocked", reason: "permission-denied", operation, message: result.message };
	if (result.kind === "ambiguous") return { status: "blocked", reason: "ambiguous-outcome", operation, message: result.message };
	if (result.kind === "retryable") return { status: "blocked", reason: "retry-exhausted", operation, message: result.message };
	return { status: "blocked", reason: "adapter-error", operation, message: result.message };
}

function checkBlocked(
	operation: string,
	result: Exclude<GitHubMutationResult<unknown>, { status: "ok" }>,
): Extract<AiGatePublicationResult, { status: "blocked" }> {
	return blocked(operation, result);
}

function reviewRecords(
	request: ReviewEvidencePublicationRequest,
	publications: RemoteReviewPublication[],
): ConfirmedPublicationRecord[] | undefined {
	const matching = publications.filter((publication) => markerValue(publication.body, "run") === request.runId);
	if (matching.length === 0) return undefined;
	const summaries = matching.filter((publication) => publication.surface === "pr-review-summary" && markerValue(publication.body, "finding") === undefined);
	if (summaries.length !== 1) return [];
	const threads = request.findings.map((finding) => matching.filter((publication) =>
		publication.surface === "pr-review-thread" && markerValue(publication.body, "finding") === finding.findingId));
	if (threads.some((items) => items.length !== 1)) return [];
	if (matching.length !== 1 + request.findings.length) return [];

	return [
		{
			recordType: "publication",
			publicationId: request.summaryPublicationId,
			issue: request.issue,
			pullRequest: request.pullRequest.number,
			subjectSha: request.subjectSha,
			source: "review-child",
			runId: request.runId,
			provider: "github",
			surface: "pr-review-summary",
			externalKey: summaries[0].externalKey,
			...(summaries[0].url ? { url: summaries[0].url } : {}),
		},
		...request.findings.map((finding, index): ConfirmedPublicationRecord => ({
			recordType: "publication",
			publicationId: finding.publicationId,
			issue: request.issue,
			pullRequest: request.pullRequest.number,
			subjectSha: request.subjectSha,
			source: "review-child",
			runId: request.runId,
			findingId: finding.findingId,
			provider: "github",
			surface: "pr-review-thread",
			externalKey: threads[index][0].externalKey,
			...(threads[index][0].url ? { url: threads[index][0].url } : {}),
		})),
	];
}

async function readReviewWithRetries(
	adapter: GitHubReviewPublicationAdapter,
	request: ReviewEvidencePublicationRequest,
): Promise<GitHubMutationResult<RemoteReviewPublication[]>> {
	const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	let result: GitHubMutationResult<RemoteReviewPublication[]> = { status: "error", kind: "unknown", message: "Review publication was not read." };
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		result = await adapter.readReviewPublications(request.pullRequest);
		if (result.status === "ok" || result.kind !== "retryable" || attempt === maxAttempts) return result;
		await adapter.wait(result.retryAfterMs ?? DEFAULT_RETRY_MS);
	}
	return result;
}

export async function publishReviewEvidence(
	adapter: GitHubReviewPublicationAdapter,
	request: ReviewEvidencePublicationRequest,
): Promise<ReviewEvidencePublicationResult> {
	const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const existing = await readReviewWithRetries(adapter, request);
		if (existing.status === "error") return blocked("read-review-publications", existing);
		const existingRecords = reviewRecords(request, existing.value);
		if (existingRecords?.length) return { status: "published", disposition: "reconciled", publicationRecords: existingRecords };
		if (existingRecords) return { status: "blocked", reason: "duplicate-conflict", operation: "reconcile-review", message: `GitHub contains incomplete or duplicate Matt publications for review run ${request.runId}.` };

		const created = await adapter.createReview(request.pullRequest, {
			commitSha: request.subjectSha,
			event: "COMMENT",
			body: markedBody(`Matt review: ${request.verdict}\n\n${request.summary}`, runMarker(request.runId)),
			comments: request.findings.map((finding) => ({
				path: finding.path,
				line: finding.line,
				side: "RIGHT",
				body: markedBody(finding.body, runMarker(request.runId), findingMarker(finding.findingId)),
			})),
		});

		if (created.status === "error") {
			if (created.kind === "retryable" && attempt < maxAttempts) {
				await adapter.wait(created.retryAfterMs ?? DEFAULT_RETRY_MS);
				continue;
			}
			if (created.kind === "ambiguous") {
				const reconciled = await readReviewWithRetries(adapter, request);
				if (reconciled.status === "ok") {
					const records = reviewRecords(request, reconciled.value);
					if (records?.length) return { status: "published", disposition: "reconciled", publicationRecords: records };
					if (records) return { status: "blocked", reason: "duplicate-conflict", operation: "reconcile-review", message: `GitHub contains incomplete or duplicate Matt publications for review run ${request.runId}.` };
				}
			}
			return blocked("create-review", created);
		}

		for (let confirmationAttempt = 1; confirmationAttempt <= maxAttempts; confirmationAttempt += 1) {
			const confirmed = await adapter.readReviewPublications(request.pullRequest);
			if (confirmed.status === "ok") {
				const records = reviewRecords(request, confirmed.value);
				if (records?.length) return { status: "published", disposition: "created", publicationRecords: records };
				if (records) return { status: "blocked", reason: "duplicate-conflict", operation: "confirm-review", message: `GitHub confirmed conflicting Matt publications for review run ${request.runId}.` };
			} else if (confirmed.kind !== "retryable") return blocked("confirm-review", confirmed);
			if (confirmationAttempt < maxAttempts) await adapter.wait(confirmed.status === "error" ? confirmed.retryAfterMs ?? DEFAULT_RETRY_MS : DEFAULT_RETRY_MS);
		}
		return { status: "blocked", reason: "ambiguous-outcome", operation: "confirm-review", message: "GitHub accepted the review mutation but did not confirm all marked publications." };
	}
	return { status: "blocked", reason: "retry-exhausted", operation: "create-review", message: "Review publication retry budget was exhausted." };
}

function conclusion(verdict: AiGateEvaluation["verdict"]): CheckRunInput["conclusion"] {
	if (verdict === "PASS") return "success";
	if (verdict === "FIX") return "failure";
	return "action-required";
}

function checkInput(request: AiGatePublicationRequest, evaluation: AiGateEvaluation, headSha: string, name: string): CheckRunInput {
	const externalId = `matt-ai-gate:${request.runId}:${request.subjectSha}`;
	return {
		name,
		headSha,
		externalId,
		status: "completed",
		conclusion: conclusion(evaluation.verdict),
		title: `Matt AI gate: ${evaluation.verdict}`,
		summary: markedBody(evaluation.summary, `<!-- matt-ai-gate-run:${request.runId};subject:${request.subjectSha} -->`),
		annotations: evaluation.findings.map((finding) => ({
			path: finding.path,
			startLine: finding.startLine,
			endLine: finding.endLine ?? finding.startLine,
			level: finding.level,
			message: finding.summary,
			rawDetails: markedBody(finding.details ?? finding.summary, runMarker(request.runId), findingMarker(finding.findingId)),
		})),
	};
}

function sameApp(actual: GitHubAppIdentity | undefined, expected: GitHubAppIdentity): boolean {
	return actual?.appId === expected.appId && actual.slug === expected.slug;
}

function exactChecks(checks: RemoteCheckRun[], externalId: string, expectedApp: GitHubAppIdentity): RemoteCheckRun[] {
	return checks.filter((check) => check.externalId === externalId && sameApp(check.app, expectedApp));
}

function annotationsMatch(actual: CheckRunInput["annotations"], expected: CheckRunInput["annotations"]): boolean {
	return actual.length === expected.length && actual.every((annotation, index) => {
		const projected = expected[index];
		return annotation.path === projected.path
			&& annotation.startLine === projected.startLine
			&& annotation.endLine === projected.endLine
			&& annotation.level === projected.level
			&& annotation.message === projected.message
			&& annotation.rawDetails === projected.rawDetails;
	});
}

function checkProjectsInput(check: RemoteCheckRun, input: CheckRunInput, expectedApp: GitHubAppIdentity): boolean {
	const output = check.output;
	return check.headSha === input.headSha
		&& check.name === input.name
		&& check.externalId === input.externalId
		&& sameApp(check.app, expectedApp)
		&& output !== undefined
		&& output.name === input.name
		&& output.externalId === input.externalId
		&& output.status === input.status
		&& output.conclusion === input.conclusion
		&& output.title === input.title
		&& output.summary === input.summary
		&& annotationsMatch(output.annotations, input.annotations);
}

function divergentCheck(input: CheckRunInput): Extract<AiGatePublicationResult, { status: "blocked" }> {
	return {
		status: "blocked",
		reason: "duplicate-conflict",
		operation: "reconcile-check",
		message: `The existing ${input.name} check on ${input.headSha} does not exactly project the captured Subject-SHA result.`,
	};
}

async function readCheck(
	adapter: GitHubChecksPublicationAdapter,
	request: AiGatePublicationRequest,
	headSha: string,
	name: string,
): Promise<GitHubMutationResult<RemoteCheckRun[]>> {
	const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	let result: GitHubMutationResult<RemoteCheckRun[]> = { status: "error", kind: "unknown", message: "Check run was not read." };
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		result = await adapter.readCheckRuns(request.pullRequest, headSha, name);
		if (result.status === "ok" || result.kind !== "retryable" || attempt === maxAttempts) return result;
		await adapter.wait(result.retryAfterMs ?? DEFAULT_RETRY_MS);
	}
	return result;
}

async function ensureCheck(
	adapter: GitHubChecksPublicationAdapter,
	request: AiGatePublicationRequest,
	input: CheckRunInput,
): Promise<RemoteCheckRun | Extract<AiGatePublicationResult, { status: "blocked" }>> {
	const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const read = await readCheck(adapter, request, input.headSha, input.name);
		if (read.status === "error") return checkBlocked("read-check-runs", read);
		const matches = exactChecks(read.value, input.externalId, request.expectedApp);
		if (matches.length === 1) return checkProjectsInput(matches[0], input, request.expectedApp) ? matches[0] : divergentCheck(input);
		if (matches.length > 1) return { status: "blocked", reason: "duplicate-conflict", operation: "reconcile-check", message: `GitHub contains duplicate ${input.name} checks for ${input.externalId}.` };

		const created = await adapter.createCheckRun(request.pullRequest, input);
		if (created.status === "error") {
			if (created.kind === "retryable" && attempt < maxAttempts) {
				await adapter.wait(created.retryAfterMs ?? DEFAULT_RETRY_MS);
				continue;
			}
			if (created.kind === "ambiguous") {
				const reconciled = await readCheck(adapter, request, input.headSha, input.name);
				if (reconciled.status === "ok") {
					const reconciledMatches = exactChecks(reconciled.value, input.externalId, request.expectedApp);
					if (reconciledMatches.length === 1) return checkProjectsInput(reconciledMatches[0], input, request.expectedApp) ? reconciledMatches[0] : divergentCheck(input);
					if (reconciledMatches.length > 1) return { status: "blocked", reason: "duplicate-conflict", operation: "reconcile-check", message: `GitHub contains duplicate ${input.name} checks for ${input.externalId}.` };
				}
			}
			return checkBlocked("create-check-run", created);
		}

		for (let confirmationAttempt = 1; confirmationAttempt <= maxAttempts; confirmationAttempt += 1) {
			const confirmed = await adapter.readCheckRuns(request.pullRequest, input.headSha, input.name);
			if (confirmed.status === "ok") {
				const confirmedMatches = exactChecks(confirmed.value, input.externalId, request.expectedApp);
				if (confirmedMatches.length === 1) return checkProjectsInput(confirmedMatches[0], input, request.expectedApp) ? confirmedMatches[0] : divergentCheck(input);
				if (confirmedMatches.length > 1) return { status: "blocked", reason: "duplicate-conflict", operation: "confirm-check", message: `GitHub confirmed duplicate ${input.name} checks for ${input.externalId}.` };
			} else if (confirmed.kind !== "retryable") return checkBlocked("confirm-check", confirmed);
			if (confirmationAttempt < maxAttempts) await adapter.wait(confirmed.status === "error" ? confirmed.retryAfterMs ?? DEFAULT_RETRY_MS : DEFAULT_RETRY_MS);
		}
		return { status: "blocked", reason: "ambiguous-outcome", operation: "confirm-check", message: `GitHub accepted ${input.name} but did not confirm its creation.` };
	}
	return { status: "blocked", reason: "retry-exhausted", operation: "create-check-run", message: "Check publication retry budget was exhausted." };
}

function withoutMattMarkers(value: string): string {
	return value
		.replace(new RegExp(`\\n*<!--\\s*matt-review-(?:run|finding):${UUID_V4_SOURCE}\\s*-->`, "g"), "")
		.replace(new RegExp(`\\n*<!--\\s*matt-ai-gate-run:${UUID_V4_SOURCE};subject:[0-9a-f]{40}\\s*-->`, "g"), "")
		.trim();
}

function evaluationFromOutput(output: RemoteCheckRun["output"], request: AiGatePublicationRequest): AiGateEvaluation | undefined {
	if (!output) return undefined;
	const subjectMarkers = [...output.summary.matchAll(new RegExp(`<!--\\s*matt-ai-gate-run:(${UUID_V4_SOURCE});subject:([0-9a-f]{40})\\s*-->`, "g"))];
	if (subjectMarkers.length !== 1 || subjectMarkers[0][1] !== request.runId || subjectMarkers[0][2] !== request.subjectSha) return undefined;
	const findingIds = output.annotations.map((annotation) => markerValue(annotation.rawDetails, "finding"));
	if (findingIds.some((findingId) => findingId === undefined)) return undefined;
	const verdict = output.conclusion === "success" ? "PASS" : output.conclusion === "failure" ? "FIX" : "BLOCKER";
	return {
		verdict,
		summary: withoutMattMarkers(output.summary),
		findings: output.annotations.map((annotation, index) => ({
			findingId: findingIds[index]!,
			path: annotation.path,
			startLine: annotation.startLine,
			endLine: annotation.endLine,
			level: annotation.level,
			summary: annotation.message,
			details: withoutMattMarkers(annotation.rawDetails),
		})),
	};
}

export async function publishAiGateEvidence(
	adapter: GitHubChecksPublicationAdapter,
	runner: AiGateRunner,
	request: AiGatePublicationRequest,
): Promise<AiGatePublicationResult> {
	const capability = await adapter.readCapability();
	if (capability.status === "error") return checkBlocked("checks-capability", capability);
	if (capability.value.credentialSource !== "external"
		|| capability.value.credentialType !== "github-app"
		|| !sameApp(capability.value.app, request.expectedApp)
		|| capability.value.writePermissions.length !== 1
		|| capability.value.writePermissions[0] !== "checks") {
		return { status: "blocked", reason: "invalid-capability", operation: "checks-capability", message: `AI-gate publication requires the expected GitHub App (${request.expectedApp.slug}, id ${request.expectedApp.appId}) with external Checks-only credentials.` };
	}

	const name = request.checkName ?? "matt/ai-gate";
	const externalId = `matt-ai-gate:${request.runId}:${request.subjectSha}`;
	const heads = [...new Set([request.subjectSha, request.evidenceHeadSha].filter((head): head is string => head !== undefined))];
	const existing = new Map<string, RemoteCheckRun>();
	for (const head of heads) {
		const read = await readCheck(adapter, request, head, name);
		if (read.status === "error") return checkBlocked("read-check-runs", read);
		const matches = exactChecks(read.value, externalId, request.expectedApp);
		if (matches.length > 1) return { status: "blocked", reason: "duplicate-conflict", operation: "reconcile-check", message: `GitHub contains duplicate ${name} checks for ${externalId} from the expected App.` };
		if (matches.length === 1) existing.set(head, matches[0]);
	}

	let evaluation = evaluationFromOutput(existing.get(request.subjectSha)?.output, request);
	if (!evaluation) {
		if (existing.has(request.subjectSha)) {
			return { status: "blocked", reason: "duplicate-conflict", operation: "reconcile-check", message: "The expected App's Subject-SHA check does not contain valid captured output for this run and Subject SHA." };
		}
		try {
			evaluation = await runner.evaluate(request.subjectSha);
		} catch (error) {
			return { status: "blocked", reason: "adapter-error", operation: "ai-gate", message: error instanceof Error ? error.message : String(error) };
		}
	}

	for (const head of heads) {
		const prior = existing.get(head);
		const input = checkInput(request, evaluation, head, name);
		if (prior && !checkProjectsInput(prior, input, request.expectedApp)) return divergentCheck(input);
	}
	if (existing.size === heads.length) return { status: "published", disposition: "reconciled", checks: heads.map((head) => existing.get(head)!) };

	const checks: RemoteCheckRun[] = [];
	for (const head of heads) {
		const prior = existing.get(head);
		if (prior) {
			checks.push(prior);
			continue;
		}
		const check = await ensureCheck(adapter, request, checkInput(request, evaluation, head, name));
		if ("status" in check) return check;
		checks.push(check);
	}
	return { status: "published", disposition: "created", evaluation, checks };
}

export type {
	AiGatePublicationRequest,
	AiGatePublicationResult,
	AiGateRunner,
	GitHubChecksPublicationAdapter,
	GitHubReviewPublicationAdapter,
	ReviewEvidencePublicationRequest,
	ReviewEvidencePublicationResult,
} from "./types";
