export const REVIEW_LEDGER_SOURCES = ["review-child", "ai-gate"] as const;
export const REVIEW_LEDGER_CYCLES = ["initial", "fix-1", "fix-2", "fix-3"] as const;
export const REVIEW_LEDGER_VERDICTS = ["PASS", "FIX", "BLOCKER"] as const;
export const REVIEW_LEDGER_CATEGORIES = [
	"spec-miss",
	"correctness",
	"test-gap",
	"convention-violation",
	"architecture",
	"verification-skipped",
] as const;
export const REVIEW_LEDGER_REPEATS = ["none", "earlier-cycle", "earlier-issue"] as const;

export type ReviewLedgerSource = typeof REVIEW_LEDGER_SOURCES[number];
export type ReviewLedgerCycle = typeof REVIEW_LEDGER_CYCLES[number];
export type ReviewLedgerVerdict = typeof REVIEW_LEDGER_VERDICTS[number];
export type ReviewLedgerCategory = typeof REVIEW_LEDGER_CATEGORIES[number];
export type ReviewLedgerRepeat = typeof REVIEW_LEDGER_REPEATS[number];

export type ReviewLedgerPassRecord = {
	date: string;
	issue: number;
	cycle: ReviewLedgerCycle;
	verdict: "PASS";
	source: ReviewLedgerSource;
};

export type ReviewLedgerFindingRecord = {
	date: string;
	issue: number;
	cycle: ReviewLedgerCycle;
	verdict: ReviewLedgerVerdict;
	source: ReviewLedgerSource;
	location: string;
	severity: string;
	summary: string;
	category: ReviewLedgerCategory;
	whyMissed: string;
	workerSkillPack: string[];
	repeat: ReviewLedgerRepeat;
};

export type ReviewLedgerRecord = ReviewLedgerPassRecord | ReviewLedgerFindingRecord;
export type ReviewLedgerValidation = { ok: true; record: ReviewLedgerRecord } | { ok: false; reason: string };
export type ReviewLedgerParseResult = { ok: true; records: ReviewLedgerRecord[] } | { ok: false; errors: Array<{ line: number; reason: string }> };

const COMMON_FIELDS = new Set(["date", "issue", "cycle", "verdict", "source"]);
const FINDING_FIELDS = ["location", "severity", "summary", "category", "whyMissed", "workerSkillPack", "repeat"] as const;
const ALL_FIELDS = new Set([...COMMON_FIELDS, ...FINDING_FIELDS]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClosedValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
	return typeof value === "string" && values.includes(value as T[number]);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function validUtcDate(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
	const timestamp = Date.parse(value);
	if (Number.isNaN(timestamp)) return false;
	const canonicalValue = value.includes(".") ? value : value.replace("Z", ".000Z");
	return new Date(timestamp).toISOString() === canonicalValue;
}

function validLocation(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const match = value.trim().match(/^.+:(\d+)$/);
	return Boolean(match && Number(match[1]) > 0);
}

function invalid(reason: string): ReviewLedgerValidation {
	return { ok: false, reason };
}

export function validateReviewLedgerRecord(value: unknown): ReviewLedgerValidation {
	if (!isRecord(value)) return invalid("record must be a JSON object");
	for (const key of Object.keys(value)) {
		if (!ALL_FIELDS.has(key)) return invalid(`unknown field: ${key}`);
	}
	if (!validUtcDate(value.date)) return invalid("date must be an ISO 8601 UTC timestamp");
	if (!Number.isInteger(value.issue) || Number(value.issue) <= 0) return invalid("issue must be a positive integer");
	if (!isClosedValue(REVIEW_LEDGER_CYCLES, value.cycle)) return invalid("cycle must be initial, fix-1, fix-2, or fix-3");
	if (!isClosedValue(REVIEW_LEDGER_VERDICTS, value.verdict)) return invalid("verdict must be PASS, FIX, or BLOCKER");
	if (value.source !== undefined && !isClosedValue(REVIEW_LEDGER_SOURCES, value.source)) {
		return invalid("source must be review-child or ai-gate when present");
	}

	const source = (value.source ?? "review-child") as ReviewLedgerSource;
	const hasFindingField = FINDING_FIELDS.some((field) => field in value);
	if (!hasFindingField) {
		for (const key of Object.keys(value)) {
			if (!COMMON_FIELDS.has(key)) return invalid(`verdict-only record must omit ${key}`);
		}
		if (value.verdict !== "PASS") return invalid("verdict-only record must use PASS");
		return { ok: true, record: { date: value.date, issue: value.issue as number, cycle: value.cycle, verdict: "PASS", source } };
	}

	for (const field of FINDING_FIELDS) {
		if (!(field in value)) return invalid(`finding record is missing ${field}`);
	}
	if (!validLocation(value.location)) return invalid("location must be file:line with a positive line number");
	if (!nonEmptyString(value.severity)) return invalid("severity must be a non-empty string");
	if (!nonEmptyString(value.summary)) return invalid("summary must be a non-empty string");
	if (!isClosedValue(REVIEW_LEDGER_CATEGORIES, value.category)) return invalid("category is not in the closed taxonomy");
	if (!nonEmptyString(value.whyMissed)) return invalid("whyMissed must be a non-empty string");
	if (!Array.isArray(value.workerSkillPack) || value.workerSkillPack.length === 0 || !value.workerSkillPack.every(nonEmptyString)) {
		return invalid("workerSkillPack must be a non-empty array of skill IDs");
	}
	if (!isClosedValue(REVIEW_LEDGER_REPEATS, value.repeat)) return invalid("repeat must be none, earlier-cycle, or earlier-issue");

	return {
		ok: true,
		record: {
			date: value.date,
			issue: value.issue as number,
			cycle: value.cycle,
			verdict: value.verdict,
			source,
			location: value.location.trim(),
			severity: value.severity.trim(),
			summary: value.summary.trim(),
			category: value.category,
			whyMissed: value.whyMissed.trim(),
			workerSkillPack: [...value.workerSkillPack],
			repeat: value.repeat,
		},
	};
}

export function parseReviewLedger(contents: string): ReviewLedgerParseResult {
	const records: ReviewLedgerRecord[] = [];
	const errors: Array<{ line: number; reason: string }> = [];
	const lines = contents.split("\n");
	let nonWhitespaceLines = 0;

	for (const [index, rawLine] of lines.entries()) {
		if (rawLine.trim().length === 0) continue;
		nonWhitespaceLines += 1;
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawLine);
		} catch {
			errors.push({ line: index + 1, reason: "invalid JSON" });
			continue;
		}
		const validation = validateReviewLedgerRecord(parsed);
		if (!validation.ok) errors.push({ line: index + 1, reason: validation.reason });
		else records.push(validation.record);
	}

	if (nonWhitespaceLines === 0) errors.push({ line: 0, reason: "ledger is empty" });
	return errors.length > 0 ? { ok: false, errors } : { ok: true, records };
}

export type AiGateDisposition = "must-fix" | "should-fix" | "non-remediable-blocker";

export function mapAiGateVerdict(outcome: {
	status: "success" | "failure";
	findings: Array<{ disposition: AiGateDisposition }>;
}): ReviewLedgerVerdict {
	if (outcome.status === "failure") return "BLOCKER";
	if (outcome.findings.some((finding) => finding.disposition === "non-remediable-blocker")) return "BLOCKER";
	if (outcome.findings.length > 0) return "FIX";
	return "PASS";
}

export type ReviewSurfaceFinding = {
	location: string;
	summary: string;
	evidence?: string;
};

function normalizeLocation(location: string): string {
	return location.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\s*:\s*(\d+)$/, ":$1");
}

function normalizeFindingText(value: string | undefined): string {
	return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function sameFinding(left: ReviewSurfaceFinding, right: ReviewSurfaceFinding): boolean {
	if (normalizeLocation(left.location) !== normalizeLocation(right.location)) return false;
	const sameSummary = normalizeFindingText(left.summary) === normalizeFindingText(right.summary);
	const leftEvidence = normalizeFindingText(left.evidence);
	const rightEvidence = normalizeFindingText(right.evidence);
	return sameSummary || (leftEvidence.length > 0 && leftEvidence === rightEvidence);
}

export function findNovelAiGateFindings<T extends ReviewSurfaceFinding>(
	reviewChildFindings: readonly ReviewSurfaceFinding[],
	aiGateFindings: readonly T[],
): T[] {
	return aiGateFindings.filter((gateFinding) => !reviewChildFindings.some((reviewFinding) => sameFinding(reviewFinding, gateFinding)));
}

export function buildAiGateFailureRecord(input: {
	date: string;
	issue: number;
	cycle: ReviewLedgerCycle;
	location: string;
	summary: string;
	workerSkillPack: string[];
	repeat?: ReviewLedgerRepeat;
}): ReviewLedgerFindingRecord {
	return {
		...input,
		source: "ai-gate",
		verdict: "BLOCKER",
		severity: "blocking",
		category: "verification-skipped",
		whyMissed: "The configured AI gate did not produce a usable review result.",
		repeat: input.repeat ?? "none",
	};
}
