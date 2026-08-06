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
export const REVIEW_CHILD_SEVERITIES = ["high", "medium", "low", "blocking"] as const;
export const AI_GATE_SEVERITIES = ["must-fix", "should-fix", "non-remediable-blocker", "blocking"] as const;

export type ReviewLedgerSource = typeof REVIEW_LEDGER_SOURCES[number];
export type ReviewLedgerCycle = typeof REVIEW_LEDGER_CYCLES[number];
export type ReviewLedgerVerdict = typeof REVIEW_LEDGER_VERDICTS[number];
export type ReviewLedgerCategory = typeof REVIEW_LEDGER_CATEGORIES[number];
export type ReviewLedgerRepeat = typeof REVIEW_LEDGER_REPEATS[number];
export type ReviewChildSeverity = typeof REVIEW_CHILD_SEVERITIES[number];
export type AiGateSeverity = typeof AI_GATE_SEVERITIES[number];

export type ReviewLedgerLegacyPassRecord = {
	date: string;
	issue: number;
	cycle: ReviewLedgerCycle;
	verdict: "PASS";
	source: ReviewLedgerSource;
};

export type ReviewLedgerLegacyFindingRecord = {
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

export type ReviewLedgerV2PassRecord = {
	schemaVersion: 2;
	date: string;
	issue: number;
	cycle: ReviewLedgerCycle;
	verdict: "PASS";
	source: ReviewLedgerSource;
	runId: string;
	workerSkillPack: string[];
};

export type ReviewLedgerV2FindingRecord = {
	schemaVersion: 2;
	date: string;
	issue: number;
	cycle: ReviewLedgerCycle;
	verdict: "FIX" | "BLOCKER";
	source: ReviewLedgerSource;
	runId: string;
	workerSkillPack: string[];
	findingId: string;
	location: string;
	severity: ReviewChildSeverity | AiGateSeverity;
	summary: string;
	category: ReviewLedgerCategory;
	whyMissed: string;
	repeat: ReviewLedgerRepeat;
	repeatsFindingId?: string;
	repeatsLegacyLine?: number;
	recurringClassKey?: string;
};

export type ReviewLedgerPassRecord = ReviewLedgerLegacyPassRecord | ReviewLedgerV2PassRecord;
export type ReviewLedgerFindingRecord = ReviewLedgerLegacyFindingRecord | ReviewLedgerV2FindingRecord;
export type ReviewLedgerRecord = ReviewLedgerPassRecord | ReviewLedgerFindingRecord;
export type ReviewLedgerValidation = { ok: true; record: ReviewLedgerRecord } | { ok: false; reason: string };
export type ReviewLedgerParseResult = { ok: true; records: ReviewLedgerRecord[] } | { ok: false; errors: Array<{ line: number; reason: string }> };

const LEGACY_COMMON_FIELDS = new Set(["date", "issue", "cycle", "verdict", "source"]);
const LEGACY_FINDING_FIELDS = ["location", "severity", "summary", "category", "whyMissed", "workerSkillPack", "repeat"] as const;
const LEGACY_ALL_FIELDS = new Set([...LEGACY_COMMON_FIELDS, ...LEGACY_FINDING_FIELDS]);
const V2_COMMON_FIELDS = new Set([...LEGACY_COMMON_FIELDS, "schemaVersion", "runId", "workerSkillPack"]);
const V2_FINDING_FIELDS = [
	"findingId",
	"location",
	"severity",
	"summary",
	"category",
	"whyMissed",
	"repeat",
	"repeatsFindingId",
	"repeatsLegacyLine",
	"recurringClassKey",
] as const;
const V2_ALL_FIELDS = new Set([...V2_COMMON_FIELDS, ...V2_FINDING_FIELDS]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClosedValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
	return typeof value === "string" && values.includes(value as T[number]);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function nonEmptySkillPack(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function validUuidV4(value: unknown): value is string {
	return typeof value === "string" && UUID_V4.test(value);
}

function normalizeRecurringSummary(value: string): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase("en-US")
		.trim()
		.replace(/\s+/g, " ")
		.replace(/\p{Decimal_Number}+/gu, "#")
		.replace(/[!"$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "")
		.trim()
		.replace(/\s+/g, " ");
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

function validateBaseFields(value: Record<string, unknown>): ReviewLedgerValidation | undefined {
	if (!validUtcDate(value.date)) return invalid("date must be an ISO 8601 UTC timestamp");
	if (!Number.isInteger(value.issue) || Number(value.issue) <= 0) return invalid("issue must be a positive integer");
	if (!isClosedValue(REVIEW_LEDGER_CYCLES, value.cycle)) return invalid("cycle must be initial, fix-1, fix-2, or fix-3");
	if (!isClosedValue(REVIEW_LEDGER_VERDICTS, value.verdict)) return invalid("verdict must be PASS, FIX, or BLOCKER");
	if (value.source !== undefined && !isClosedValue(REVIEW_LEDGER_SOURCES, value.source)) {
		return invalid("source must be review-child or ai-gate when present");
	}
	return undefined;
}

function validateLegacyRecord(value: Record<string, unknown>): ReviewLedgerValidation {
	for (const key of Object.keys(value)) {
		if (!LEGACY_ALL_FIELDS.has(key)) return invalid(`unknown field: ${key}`);
	}
	const baseError = validateBaseFields(value);
	if (baseError) return baseError;

	const source = (value.source ?? "review-child") as ReviewLedgerSource;
	const hasFindingField = LEGACY_FINDING_FIELDS.some((field) => field in value);
	if (!hasFindingField) {
		for (const key of Object.keys(value)) {
			if (!LEGACY_COMMON_FIELDS.has(key)) return invalid(`verdict-only record must omit ${key}`);
		}
		if (value.verdict !== "PASS") return invalid("verdict-only record must use PASS");
		return { ok: true, record: { date: value.date as string, issue: value.issue as number, cycle: value.cycle as ReviewLedgerCycle, verdict: "PASS", source } };
	}

	for (const field of LEGACY_FINDING_FIELDS) {
		if (!(field in value)) return invalid(`finding record is missing ${field}`);
	}
	if (!validLocation(value.location)) return invalid("location must be file:line with a positive line number");
	if (!nonEmptyString(value.severity)) return invalid("severity must be a non-empty string");
	if (!nonEmptyString(value.summary)) return invalid("summary must be a non-empty string");
	if (!isClosedValue(REVIEW_LEDGER_CATEGORIES, value.category)) return invalid("category is not in the closed taxonomy");
	if (!nonEmptyString(value.whyMissed)) return invalid("whyMissed must be a non-empty string");
	if (!nonEmptySkillPack(value.workerSkillPack)) return invalid("workerSkillPack must be a non-empty array of skill IDs");
	if (!isClosedValue(REVIEW_LEDGER_REPEATS, value.repeat)) return invalid("repeat must be none, earlier-cycle, or earlier-issue");

	return {
		ok: true,
		record: {
			date: value.date as string,
			issue: value.issue as number,
			cycle: value.cycle as ReviewLedgerCycle,
			verdict: value.verdict as ReviewLedgerVerdict,
			source,
			location: (value.location as string).trim(),
			severity: (value.severity as string).trim(),
			summary: (value.summary as string).trim(),
			category: value.category as ReviewLedgerCategory,
			whyMissed: (value.whyMissed as string).trim(),
			workerSkillPack: [...value.workerSkillPack as string[]],
			repeat: value.repeat as ReviewLedgerRepeat,
		},
	};
}

function validateV2Severity(value: Record<string, unknown>): ReviewLedgerValidation | undefined {
	if (value.source === "review-child") {
		if (!isClosedValue(REVIEW_CHILD_SEVERITIES, value.severity)) {
			return invalid("review-child severity must be high, medium, low, or blocking");
		}
		if (value.severity === "blocking" && (value.verdict !== "BLOCKER" || value.category !== "verification-skipped")) {
			return invalid("blocking severity is reserved for synthesized verification-skipped failures");
		}
		return undefined;
	}
	if (!isClosedValue(AI_GATE_SEVERITIES, value.severity)) {
		return invalid("ai-gate severity must be must-fix, should-fix, non-remediable-blocker, or blocking");
	}
	if ((value.severity === "must-fix" || value.severity === "should-fix") && value.verdict !== "FIX") {
		return invalid(`ai-gate severity ${value.severity} requires verdict FIX`);
	}
	if ((value.severity === "non-remediable-blocker" || value.severity === "blocking") && value.verdict !== "BLOCKER") {
		return invalid(`ai-gate severity ${value.severity} requires verdict BLOCKER`);
	}
	if (value.severity === "blocking" && value.category !== "verification-skipped") {
		return invalid("ai-gate blocking severity is reserved for verification-skipped failures");
	}
	return undefined;
}

function validateV2RepeatFields(value: Record<string, unknown>): ReviewLedgerValidation | undefined {
	const hasFindingReference = value.repeatsFindingId !== undefined;
	const hasLegacyReference = value.repeatsLegacyLine !== undefined;
	if (hasFindingReference && !validUuidV4(value.repeatsFindingId)) {
		return invalid("repeatsFindingId must be a canonical lowercase UUIDv4");
	}
	if (hasLegacyReference && (!Number.isInteger(value.repeatsLegacyLine) || Number(value.repeatsLegacyLine) <= 0)) {
		return invalid("repeatsLegacyLine must be a positive integer");
	}

	if (value.repeat === "none") {
		if (hasFindingReference || hasLegacyReference || value.recurringClassKey !== undefined) {
			return invalid("repeat none must omit repeatsFindingId, repeatsLegacyLine, and recurringClassKey");
		}
		return undefined;
	}
	if (Number(hasFindingReference) + Number(hasLegacyReference) !== 1) {
		return invalid(`repeat ${value.repeat as string} requires exactly one antecedent reference`);
	}
	if (value.repeat === "earlier-cycle") {
		if (value.recurringClassKey !== undefined) return invalid("repeat earlier-cycle must omit recurringClassKey");
		return undefined;
	}
	if (!nonEmptyString(value.recurringClassKey)) return invalid("repeat earlier-issue requires recurringClassKey");
	const prefix = `${value.category as string}|`;
	const recurringClassKey = value.recurringClassKey as string;
	const summaryKey = recurringClassKey.slice(prefix.length);
	if (!recurringClassKey.startsWith(prefix) || summaryKey.length === 0 || normalizeRecurringSummary(summaryKey) !== summaryKey) {
		return invalid("recurringClassKey must use <category>|<normalized-summary>");
	}
	return undefined;
}

function validateV2Record(value: Record<string, unknown>): ReviewLedgerValidation {
	for (const key of Object.keys(value)) {
		if (!V2_ALL_FIELDS.has(key)) return invalid(`unknown field: ${key}`);
	}
	const baseError = validateBaseFields(value);
	if (baseError) return baseError;
	if (!isClosedValue(REVIEW_LEDGER_SOURCES, value.source)) return invalid("source is required on v2 records");
	if (!validUuidV4(value.runId)) return invalid("runId must be a canonical lowercase UUIDv4");
	if (!nonEmptySkillPack(value.workerSkillPack)) return invalid("workerSkillPack must be a non-empty array of skill IDs");

	const hasFindingField = V2_FINDING_FIELDS.some((field) => field in value);
	if (!hasFindingField) {
		for (const key of Object.keys(value)) {
			if (!V2_COMMON_FIELDS.has(key)) return invalid(`verdict-only record must omit ${key}`);
		}
		if (value.verdict !== "PASS") return invalid("verdict-only record must use PASS");
		return {
			ok: true,
			record: {
				schemaVersion: 2,
				date: value.date as string,
				issue: value.issue as number,
				cycle: value.cycle as ReviewLedgerCycle,
				verdict: "PASS",
				source: value.source,
				runId: value.runId,
				workerSkillPack: [...value.workerSkillPack],
			},
		};
	}

	const requiredFindingFields = ["findingId", "location", "severity", "summary", "category", "whyMissed", "repeat"] as const;
	for (const field of requiredFindingFields) {
		if (!(field in value)) return invalid(`finding record is missing ${field}`);
	}
	if (value.verdict !== "FIX" && value.verdict !== "BLOCKER") return invalid("v2 finding record must use FIX or BLOCKER");
	if (!validUuidV4(value.findingId)) return invalid("findingId must be a canonical lowercase UUIDv4");
	if (!validLocation(value.location)) return invalid("location must be file:line with a positive line number");
	if (!nonEmptyString(value.summary)) return invalid("summary must be a non-empty string");
	if (!isClosedValue(REVIEW_LEDGER_CATEGORIES, value.category)) return invalid("category is not in the closed taxonomy");
	if (!nonEmptyString(value.whyMissed)) return invalid("whyMissed must be a non-empty string");
	if (!isClosedValue(REVIEW_LEDGER_REPEATS, value.repeat)) return invalid("repeat must be none, earlier-cycle, or earlier-issue");
	const severityError = validateV2Severity(value);
	if (severityError) return severityError;
	const repeatError = validateV2RepeatFields(value);
	if (repeatError) return repeatError;

	return {
		ok: true,
		record: {
			schemaVersion: 2,
			date: value.date as string,
			issue: value.issue as number,
			cycle: value.cycle as ReviewLedgerCycle,
			verdict: value.verdict,
			source: value.source,
			runId: value.runId,
			workerSkillPack: [...value.workerSkillPack],
			findingId: value.findingId,
			location: (value.location as string).trim(),
			severity: value.severity as ReviewChildSeverity | AiGateSeverity,
			summary: value.summary.trim(),
			category: value.category,
			whyMissed: value.whyMissed.trim(),
			repeat: value.repeat,
			...(value.repeatsFindingId !== undefined ? { repeatsFindingId: value.repeatsFindingId as string } : {}),
			...(value.repeatsLegacyLine !== undefined ? { repeatsLegacyLine: value.repeatsLegacyLine as number } : {}),
			...(value.recurringClassKey !== undefined ? { recurringClassKey: (value.recurringClassKey as string).trim() } : {}),
		},
	};
}

export function validateReviewLedgerRecord(value: unknown): ReviewLedgerValidation {
	if (!isRecord(value)) return invalid("record must be a JSON object");
	if ("schemaVersion" in value) {
		if (value.schemaVersion !== 2) return invalid("schemaVersion must be 2 when present");
		return validateV2Record(value);
	}
	return validateLegacyRecord(value);
}

function isV2Record(record: ReviewLedgerRecord): record is ReviewLedgerV2PassRecord | ReviewLedgerV2FindingRecord {
	return "schemaVersion" in record;
}

function isFindingRecord(record: ReviewLedgerRecord): record is ReviewLedgerFindingRecord {
	return "location" in record;
}

function sameSkillPack(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((skill, index) => skill === right[index]);
}

function compatibleAntecedent(current: ReviewLedgerV2FindingRecord, antecedent: ReviewLedgerFindingRecord): string | undefined {
	if (current.category !== antecedent.category) return "repeat antecedent must use the same category";
	if (
		current.repeat === "earlier-issue"
		&& "recurringClassKey" in antecedent
		&& antecedent.recurringClassKey !== undefined
		&& antecedent.recurringClassKey !== current.recurringClassKey
	) {
		return "earlier-issue antecedent with a recurringClassKey must use the same recurring class";
	}
	if (current.repeat === "earlier-cycle") {
		const currentCycle = REVIEW_LEDGER_CYCLES.indexOf(current.cycle);
		const antecedentCycle = REVIEW_LEDGER_CYCLES.indexOf(antecedent.cycle);
		if (current.issue !== antecedent.issue || antecedentCycle >= currentCycle) {
			return "earlier-cycle antecedent must use the same issue and a strictly earlier cycle";
		}
	}
	if (current.repeat === "earlier-issue" && current.issue === antecedent.issue) {
		return "earlier-issue antecedent must use a different issue";
	}
	return undefined;
}

export function parseReviewLedger(contents: string): ReviewLedgerParseResult {
	const records: ReviewLedgerRecord[] = [];
	const errors: Array<{ line: number; reason: string }> = [];
	const entries: Array<{ line: number; record: ReviewLedgerRecord }> = [];
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
		else {
			records.push(validation.record);
			entries.push({ line: index + 1, record: validation.record });
		}
	}

	const findingsById = new Map<string, { line: number; record: ReviewLedgerV2FindingRecord }>();
	const entriesByLine = new Map(entries.map((entry) => [entry.line, entry]));
	const runs = new Map<string, { line: number; record: ReviewLedgerV2PassRecord | ReviewLedgerV2FindingRecord; kind: "pass" | "findings"; count: number }>();

	for (const entry of entries) {
		if (!isV2Record(entry.record)) continue;
		const record = entry.record;
		if (isFindingRecord(record)) {
			if (findingsById.has(record.findingId)) errors.push({ line: entry.line, reason: `duplicate findingId: ${record.findingId}` });

			let antecedent: ReviewLedgerFindingRecord | undefined;
			if (record.repeatsFindingId !== undefined) {
				antecedent = findingsById.get(record.repeatsFindingId)?.record;
				if (!antecedent) errors.push({ line: entry.line, reason: "repeatsFindingId must resolve to a strictly earlier v2 finding" });
			} else if (record.repeatsLegacyLine !== undefined) {
				const target = entriesByLine.get(record.repeatsLegacyLine);
				if (!target || target.line >= entry.line || isV2Record(target.record) || !isFindingRecord(target.record)) {
					errors.push({ line: entry.line, reason: "repeatsLegacyLine must resolve to a strictly earlier unversioned finding" });
				} else antecedent = target.record;
			}
			if (antecedent) {
				const incompatibility = compatibleAntecedent(record, antecedent);
				if (incompatibility) errors.push({ line: entry.line, reason: incompatibility });
			}
			if (!findingsById.has(record.findingId)) findingsById.set(record.findingId, { line: entry.line, record });
		}

		const existingRun = runs.get(record.runId);
		const kind = isFindingRecord(record) ? "findings" : "pass";
		if (!existingRun) {
			runs.set(record.runId, { line: entry.line, record, kind, count: 1 });
			continue;
		}
		if (
			existingRun.record.issue !== record.issue
			|| existingRun.record.cycle !== record.cycle
			|| existingRun.record.source !== record.source
			|| !sameSkillPack(existingRun.record.workerSkillPack, record.workerSkillPack)
		) {
			errors.push({ line: entry.line, reason: `runId ${record.runId} has incompatible issue, cycle, source, or workerSkillPack metadata` });
		}
		if (existingRun.kind !== kind) {
			errors.push({ line: entry.line, reason: `runId ${record.runId} cannot mix PASS with findings` });
		} else if (kind === "pass") {
			errors.push({ line: entry.line, reason: `runId ${record.runId} must contain exactly one verdict-only PASS` });
		}
		existingRun.count += 1;
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
	runId: string;
	findingId: string;
	location: string;
	summary: string;
	workerSkillPack: string[];
	repeat?: ReviewLedgerRepeat;
	repeatsFindingId?: string;
	repeatsLegacyLine?: number;
	recurringClassKey?: string;
}): ReviewLedgerV2FindingRecord {
	return {
		...input,
		schemaVersion: 2,
		source: "ai-gate",
		verdict: "BLOCKER",
		severity: "blocking",
		category: "verification-skipped",
		whyMissed: "The configured AI gate did not produce a usable review result.",
		repeat: input.repeat ?? "none",
	};
}
