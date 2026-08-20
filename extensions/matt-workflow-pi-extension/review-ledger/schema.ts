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
export const REVIEW_LEDGER_RECORD_TYPES = ["review-run", "finding", "publication", "recap"] as const;
export const REVIEW_PUBLICATION_SURFACES = ["pr-review-summary", "pr-review-thread"] as const;
export const REVIEW_RECAP_IMPACT_CLASSES = ["composes", "extends", "adds"] as const;
export const REVIEW_RECAP_RISKS = ["low", "medium", "high"] as const;
export const REVIEW_LEDGER_COMMAND_STAMPED_FIELDS = ["schemaVersion", "date"] as const;

export const REVIEW_LEDGER_RECORD_SHAPES = {
	legacyPass: {
		required: ["date", "issue", "cycle", "verdict"],
		optional: ["source"],
	},
	legacyFinding: {
		required: ["date", "issue", "cycle", "verdict", "location", "severity", "summary", "category", "whyMissed", "workerSkillPack", "repeat"],
		optional: ["source"],
	},
	untaggedV2Pass: {
		required: ["schemaVersion", "date", "issue", "cycle", "verdict", "source", "runId", "workerSkillPack"],
		optional: [],
	},
	untaggedV2Finding: {
		required: ["schemaVersion", "date", "issue", "cycle", "verdict", "source", "runId", "workerSkillPack", "findingId", "location", "severity", "summary", "category", "whyMissed", "repeat"],
		optional: ["repeatsFindingId", "repeatsLegacyLine", "recurringClassKey"],
	},
	taggedReviewRun: {
		required: ["schemaVersion", "recordType", "date", "issue", "pullRequest", "cycle", "source", "runId", "workerSkillPack", "subjectSha", "verdict", "findingIds", "suppressedDuplicateCount"],
		optional: [],
	},
	taggedFinding: {
		required: ["schemaVersion", "recordType", "date", "issue", "pullRequest", "cycle", "source", "runId", "workerSkillPack", "subjectSha", "verdict", "findingId", "location", "severity", "summary", "category", "whyMissed", "repeat"],
		optional: ["repeatsFindingId", "repeatsLegacyLine", "recurringClassKey"],
	},
	taggedPublication: {
		required: ["schemaVersion", "recordType", "date", "publicationId", "issue", "pullRequest", "subjectSha", "source", "runId", "provider", "surface", "externalKey"],
		optional: ["findingId", "url"],
	},
	taggedRecap: {
		required: ["schemaVersion", "recordType", "date", "recapId", "issue", "pullRequest", "subjectSha", "source", "runId", "impactClass", "displayedRisk", "touchedRecapPrimitiveIds", "removedRecapPrimitiveIds", "touchedInvariantIds"],
		optional: [],
	},
} as const;

export const REVIEW_LEDGER_RELATIONSHIPS = {
	taggedBatchOrder: ["review-run", "finding", "publication", "recap"],
	untaggedRunConsistentFields: ["issue", "cycle", "source", "workerSkillPack"],
	taggedRunConsistentFields: ["issue", "pullRequest", "cycle", "source", "workerSkillPack", "subjectSha"],
	taggedPublicationConsistentFields: ["issue", "pullRequest", "source", "subjectSha"],
	taggedRecapConsistentFields: ["issue", "pullRequest", "source", "subjectSha"],
	repeatAntecedentFields: ["repeatsFindingId", "repeatsLegacyLine"],
	recapRiskByImpactClass: { composes: "low", extends: "medium", adds: "high" },
} as const;

const [TAGGED_RUN_TYPE, TAGGED_FINDING_TYPE, TAGGED_PUBLICATION_TYPE, TAGGED_RECAP_TYPE] = REVIEW_LEDGER_RELATIONSHIPS.taggedBatchOrder;

export function describeReviewLedgerSchema() {
	return {
		schemaVersion: 2,
		mutatesLedger: false,
		commandStampedFields: REVIEW_LEDGER_COMMAND_STAMPED_FIELDS,
		taxonomies: {
			sources: REVIEW_LEDGER_SOURCES,
			cycles: REVIEW_LEDGER_CYCLES,
			verdicts: REVIEW_LEDGER_VERDICTS,
			categories: REVIEW_LEDGER_CATEGORIES,
			repeats: REVIEW_LEDGER_REPEATS,
			severitiesBySource: {
				"review-child": REVIEW_CHILD_SEVERITIES,
				"ai-gate": AI_GATE_SEVERITIES,
			},
			recordTypes: REVIEW_LEDGER_RECORD_TYPES,
			publicationSurfaces: REVIEW_PUBLICATION_SURFACES,
			recapImpactClasses: REVIEW_RECAP_IMPACT_CLASSES,
			recapRisks: REVIEW_RECAP_RISKS,
		},
		recordShapes: REVIEW_LEDGER_RECORD_SHAPES,
		relationships: REVIEW_LEDGER_RELATIONSHIPS,
	};
}

export type ReviewLedgerSource = typeof REVIEW_LEDGER_SOURCES[number];
export type ReviewLedgerCycle = typeof REVIEW_LEDGER_CYCLES[number];
export type ReviewLedgerVerdict = typeof REVIEW_LEDGER_VERDICTS[number];
export type ReviewLedgerCategory = typeof REVIEW_LEDGER_CATEGORIES[number];
export type ReviewLedgerRepeat = typeof REVIEW_LEDGER_REPEATS[number];
export type ReviewChildSeverity = typeof REVIEW_CHILD_SEVERITIES[number];
export type AiGateSeverity = typeof AI_GATE_SEVERITIES[number];
export type ReviewLedgerRecordType = typeof REVIEW_LEDGER_RECORD_TYPES[number];
export type ReviewPublicationSurface = typeof REVIEW_PUBLICATION_SURFACES[number];
export type ReviewRecapImpactClass = typeof REVIEW_RECAP_IMPACT_CLASSES[number];
export type ReviewRecapRisk = typeof REVIEW_RECAP_RISKS[number];

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

export type ReviewLedgerTaggedRunRecord = {
	schemaVersion: 2;
	recordType: "review-run";
	date: string;
	issue: number;
	pullRequest: number;
	cycle: ReviewLedgerCycle;
	source: ReviewLedgerSource;
	runId: string;
	workerSkillPack: string[];
	subjectSha: string;
	verdict: ReviewLedgerVerdict;
	findingIds: string[];
	suppressedDuplicateCount: number;
};

export type ReviewLedgerTaggedFindingRecord = ReviewLedgerV2FindingRecord & {
	recordType: "finding";
	pullRequest: number;
	subjectSha: string;
};

export type ReviewLedgerPublicationRecord = {
	schemaVersion: 2;
	recordType: "publication";
	date: string;
	publicationId: string;
	issue: number;
	pullRequest: number;
	subjectSha: string;
	source: "review-child";
	runId: string;
	findingId?: string;
	provider: "github";
	surface: ReviewPublicationSurface;
	externalKey: string;
	url?: string;
};

export type ReviewLedgerRecapRecord = {
	schemaVersion: 2;
	recordType: "recap";
	date: string;
	recapId: string;
	issue: number;
	pullRequest: number;
	subjectSha: string;
	source: "review-child";
	runId: string;
	impactClass: ReviewRecapImpactClass;
	displayedRisk: ReviewRecapRisk;
	touchedRecapPrimitiveIds: string[];
	removedRecapPrimitiveIds: string[];
	touchedInvariantIds: string[];
};

export type ReviewLedgerPassRecord = ReviewLedgerLegacyPassRecord | ReviewLedgerV2PassRecord;
export type ReviewLedgerFindingRecord = ReviewLedgerLegacyFindingRecord | ReviewLedgerV2FindingRecord | ReviewLedgerTaggedFindingRecord;
export type ReviewLedgerTaggedRecord = ReviewLedgerTaggedRunRecord | ReviewLedgerTaggedFindingRecord | ReviewLedgerPublicationRecord | ReviewLedgerRecapRecord;
export type ReviewLedgerRecord = ReviewLedgerPassRecord | ReviewLedgerFindingRecord | ReviewLedgerTaggedRecord;
export type ReviewLedgerValidation = { ok: true; record: ReviewLedgerRecord } | { ok: false; reason: string };
export type ReviewLedgerParseResult = { ok: true; records: ReviewLedgerRecord[] } | { ok: false; errors: Array<{ line: number; reason: string }> };

type ReviewLedgerRecordShape = typeof REVIEW_LEDGER_RECORD_SHAPES[keyof typeof REVIEW_LEDGER_RECORD_SHAPES];

function recordShapeFields(shape: ReviewLedgerRecordShape): Set<string> {
	return new Set<string>([...shape.required, ...shape.optional]);
}

const LEGACY_COMMON_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.legacyPass);
const LEGACY_ALL_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.legacyFinding);
const LEGACY_FINDING_FIELDS = REVIEW_LEDGER_RECORD_SHAPES.legacyFinding.required.filter((field) => !LEGACY_COMMON_FIELDS.has(field));
const V2_COMMON_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.untaggedV2Pass);
const V2_ALL_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.untaggedV2Finding);
const V2_FINDING_FIELDS = [
	...REVIEW_LEDGER_RECORD_SHAPES.untaggedV2Finding.required,
	...REVIEW_LEDGER_RECORD_SHAPES.untaggedV2Finding.optional,
].filter((field) => !V2_COMMON_FIELDS.has(field));
const V2_REQUIRED_FINDING_FIELDS = REVIEW_LEDGER_RECORD_SHAPES.untaggedV2Finding.required.filter((field) => !V2_COMMON_FIELDS.has(field));
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const TAGGED_RUN_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.taggedReviewRun);
const TAGGED_FINDING_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.taggedFinding);
const PUBLICATION_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.taggedPublication);
const RECAP_FIELDS = recordShapeFields(REVIEW_LEDGER_RECORD_SHAPES.taggedRecap);

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
	const [findingReferenceField, legacyReferenceField] = REVIEW_LEDGER_RELATIONSHIPS.repeatAntecedentFields;
	const hasFindingReference = value[findingReferenceField] !== undefined;
	const hasLegacyReference = value[legacyReferenceField] !== undefined;
	if (hasFindingReference && !validUuidV4(value[findingReferenceField])) {
		return invalid(`${findingReferenceField} must be a canonical lowercase UUIDv4`);
	}
	if (hasLegacyReference && (!Number.isInteger(value[legacyReferenceField]) || Number(value[legacyReferenceField]) <= 0)) {
		return invalid(`${legacyReferenceField} must be a positive integer`);
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

	for (const field of V2_REQUIRED_FINDING_FIELDS) {
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

function validateKnownFields(value: Record<string, unknown>, fields: ReadonlySet<string>): ReviewLedgerValidation | undefined {
	for (const key of Object.keys(value)) if (!fields.has(key)) return invalid(`unknown field: ${key}`);
	return undefined;
}

function validateTaggedIdentity(value: Record<string, unknown>): ReviewLedgerValidation | undefined {
	if (!validUtcDate(value.date)) return invalid("date must be an ISO 8601 UTC timestamp");
	if (!Number.isInteger(value.issue) || Number(value.issue) <= 0) return invalid("issue must be a positive integer");
	if (!Number.isInteger(value.pullRequest) || Number(value.pullRequest) <= 0) return invalid("pullRequest must be a positive integer");
	if (!validUuidV4(value.runId)) return invalid("runId must be a canonical lowercase UUIDv4");
	if (typeof value.subjectSha !== "string" || !FULL_GIT_SHA.test(value.subjectSha)) return invalid("subjectSha must be a full lowercase Git SHA");
	return undefined;
}

function uniqueUuidList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(validUuidV4) && new Set(value).size === value.length;
}

function sortedUniqueStrings(value: unknown): value is string[] {
	return Array.isArray(value)
		&& value.every(nonEmptyString)
		&& new Set(value).size === value.length
		&& value.every((entry, index) => index === 0 || value[index - 1].localeCompare(entry) < 0);
}

function validateTaggedRun(value: Record<string, unknown>): ReviewLedgerValidation {
	const fieldError = validateKnownFields(value, TAGGED_RUN_FIELDS);
	if (fieldError) return fieldError;
	const identityError = validateTaggedIdentity(value);
	if (identityError) return identityError;
	if (!isClosedValue(REVIEW_LEDGER_CYCLES, value.cycle)) return invalid("cycle must be initial, fix-1, fix-2, or fix-3");
	if (!isClosedValue(REVIEW_LEDGER_SOURCES, value.source)) return invalid("source is required on tagged review-run records");
	if (!nonEmptySkillPack(value.workerSkillPack)) return invalid("workerSkillPack must be a non-empty array of skill IDs");
	if (!isClosedValue(REVIEW_LEDGER_VERDICTS, value.verdict)) return invalid("verdict must be PASS, FIX, or BLOCKER");
	if (!uniqueUuidList(value.findingIds)) return invalid("findingIds must be a duplicate-free array of canonical lowercase UUIDv4 values");
	if (!Number.isInteger(value.suppressedDuplicateCount) || Number(value.suppressedDuplicateCount) < 0) {
		return invalid("suppressedDuplicateCount must be a non-negative integer");
	}
	if (value.verdict === "PASS" && ((value.findingIds as string[]).length > 0 || value.suppressedDuplicateCount !== 0)) {
		return invalid("PASS review-run requires no findings and zero suppressed duplicates");
	}
	if (value.verdict !== "PASS" && (value.findingIds as string[]).length === 0 && value.suppressedDuplicateCount === 0) {
		return invalid("FIX or BLOCKER review-run requires findings or suppressed duplicates");
	}
	return { ok: true, record: { ...value, workerSkillPack: [...value.workerSkillPack as string[]], findingIds: [...value.findingIds as string[]] } as ReviewLedgerTaggedRunRecord };
}

function validateTaggedFinding(value: Record<string, unknown>): ReviewLedgerValidation {
	const fieldError = validateKnownFields(value, TAGGED_FINDING_FIELDS);
	if (fieldError) return fieldError;
	const identityError = validateTaggedIdentity(value);
	if (identityError) return identityError;
	const { recordType: _recordType, pullRequest: _pullRequest, subjectSha: _subjectSha, ...untagged } = value;
	const validation = validateV2Record(untagged);
	if (!validation.ok) return validation;
	if (!("findingId" in validation.record)) return invalid("tagged finding must use the finding record shape");
	return {
		ok: true,
		record: {
			...validation.record,
			recordType: "finding",
			pullRequest: value.pullRequest as number,
			subjectSha: value.subjectSha as string,
		},
	};
}

function validAbsoluteUrl(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:";
	} catch {
		return false;
	}
}

function validatePublication(value: Record<string, unknown>): ReviewLedgerValidation {
	const fieldError = validateKnownFields(value, PUBLICATION_FIELDS);
	if (fieldError) return fieldError;
	const identityError = validateTaggedIdentity(value);
	if (identityError) return identityError;
	if (!validUuidV4(value.publicationId)) return invalid("publicationId must be a canonical lowercase UUIDv4");
	if (value.source !== "review-child") return invalid("publication source must be review-child");
	if (value.provider !== "github") return invalid("publication provider must be github");
	if (!isClosedValue(REVIEW_PUBLICATION_SURFACES, value.surface)) return invalid("publication surface must be pr-review-summary or pr-review-thread");
	if (!nonEmptyString(value.externalKey)) return invalid("externalKey must be a non-empty string");
	if (value.url !== undefined && !validAbsoluteUrl(value.url)) return invalid("url must be an absolute HTTP(S) URL when present");
	if (value.surface === "pr-review-summary" && value.findingId !== undefined) return invalid("pr-review-summary publication must omit findingId");
	if (value.surface === "pr-review-thread" && !validUuidV4(value.findingId)) return invalid("pr-review-thread publication requires a canonical findingId");
	return { ok: true, record: { ...value, externalKey: (value.externalKey as string).trim() } as ReviewLedgerPublicationRecord };
}

function validateRecap(value: Record<string, unknown>): ReviewLedgerValidation {
	const fieldError = validateKnownFields(value, RECAP_FIELDS);
	if (fieldError) return fieldError;
	const identityError = validateTaggedIdentity(value);
	if (identityError) return identityError;
	if (!validUuidV4(value.recapId)) return invalid("recapId must be a canonical lowercase UUIDv4");
	if (value.source !== "review-child") return invalid("recap source must be review-child");
	if (!isClosedValue(REVIEW_RECAP_IMPACT_CLASSES, value.impactClass)) return invalid("impactClass must be composes, extends, or adds");
	if (!isClosedValue(REVIEW_RECAP_RISKS, value.displayedRisk)) return invalid("displayedRisk must be low, medium, or high");
	for (const field of ["touchedRecapPrimitiveIds", "removedRecapPrimitiveIds", "touchedInvariantIds"] as const) {
		if (!sortedUniqueStrings(value[field])) return invalid(`${field} must be sorted and unique`);
	}
	const touched = value.touchedRecapPrimitiveIds as string[];
	const removed = value.removedRecapPrimitiveIds as string[];
	if (removed.some((id) => touched.includes(id))) return invalid("removedRecapPrimitiveIds must be separate from touchedRecapPrimitiveIds");
	if (removed.length > 0 && value.displayedRisk !== "high") return invalid("recap with removed primitives must use displayedRisk high");
	const expectedRisk = REVIEW_LEDGER_RELATIONSHIPS.recapRiskByImpactClass[value.impactClass as ReviewRecapImpactClass];
	if (removed.length === 0 && value.displayedRisk !== expectedRisk) return invalid(`${value.impactClass as string} recap must use displayedRisk ${expectedRisk}`);
	return {
		ok: true,
		record: {
			...value,
			touchedRecapPrimitiveIds: [...touched],
			removedRecapPrimitiveIds: [...removed],
			touchedInvariantIds: [...value.touchedInvariantIds as string[]],
		} as ReviewLedgerRecapRecord,
	};
}

export function validateReviewLedgerRecord(value: unknown): ReviewLedgerValidation {
	if (!isRecord(value)) return invalid("record must be a JSON object");
	if ("schemaVersion" in value) {
		if (value.schemaVersion !== 2) return invalid("schemaVersion must be 2 when present");
		if ("recordType" in value) {
			if (!isClosedValue(REVIEW_LEDGER_RECORD_TYPES, value.recordType)) return invalid("recordType must be review-run, finding, publication, or recap");
			if (value.recordType === TAGGED_RUN_TYPE) return validateTaggedRun(value);
			if (value.recordType === TAGGED_FINDING_TYPE) return validateTaggedFinding(value);
			if (value.recordType === TAGGED_PUBLICATION_TYPE) return validatePublication(value);
			if (value.recordType === TAGGED_RECAP_TYPE) return validateRecap(value);
			return invalid("recordType is not supported");
		}
		return validateV2Record(value);
	}
	return validateLegacyRecord(value);
}

function isUntaggedV2Record(record: ReviewLedgerRecord): record is ReviewLedgerV2PassRecord | ReviewLedgerV2FindingRecord {
	return "schemaVersion" in record && !("recordType" in record);
}

function isTaggedRecord(record: ReviewLedgerRecord): record is ReviewLedgerTaggedRecord {
	return "recordType" in record;
}

function isFindingRecord(record: ReviewLedgerRecord): record is ReviewLedgerFindingRecord {
	return "location" in record;
}

function sameSkillPack(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((skill, index) => skill === right[index]);
}

function matchRelationshipFields(left: object, right: object, fields: readonly string[]): boolean {
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	return fields.every((field) => {
		if (field !== "workerSkillPack") return leftRecord[field] === rightRecord[field];
		return Array.isArray(leftRecord[field])
			&& Array.isArray(rightRecord[field])
			&& sameSkillPack(leftRecord[field] as string[], rightRecord[field] as string[]);
	});
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

	const findingsById = new Map<string, { line: number; record: ReviewLedgerV2FindingRecord | ReviewLedgerTaggedFindingRecord }>();
	const entriesByLine = new Map(entries.map((entry) => [entry.line, entry]));
	const runs = new Map<string, { line: number; record: ReviewLedgerV2PassRecord | ReviewLedgerV2FindingRecord; kind: "pass" | "findings"; count: number }>();
	type TaggedRunState = { line: number; record: ReviewLedgerTaggedRunRecord; findings: ReviewLedgerTaggedFindingRecord[]; published: boolean; recapped: boolean };
	const taggedRuns = new Map<string, TaggedRunState>();
	let activeTaggedRun: TaggedRunState | undefined;
	const eventUuids = new Map<string, { line: number; kind: "findingId" | "publicationId" | "recapId" }>();
	const externalKeys = new Map<string, number>();
	const recapCadences = new Map<string, number>();

	const recordEventUuid = (uuid: string, kind: "findingId" | "publicationId" | "recapId", line: number): void => {
		const existing = eventUuids.get(uuid);
		if (!existing) {
			eventUuids.set(uuid, { line, kind });
			return;
		}
		if (existing.kind !== kind) {
			errors.push({ line, reason: `${kind} reuses event UUID ${uuid} already used as ${existing.kind} on line ${existing.line}` });
		} else if (kind !== "findingId") {
			errors.push({ line, reason: `duplicate ${kind}: ${uuid}` });
		}
	};

	for (const entry of entries) {
		const record = entry.record;
		if (!isTaggedRecord(record)) {
			if (activeTaggedRun && activeTaggedRun.findings.length !== activeTaggedRun.record.findingIds.length) {
				errors.push({ line: entry.line, reason: `record cannot interrupt tagged review-run ${activeTaggedRun.record.runId} before all declared findings` });
			}
			activeTaggedRun = undefined;
		}
		if (!("schemaVersion" in record)) continue;

		if (isFindingRecord(record)) {
			if (findingsById.has(record.findingId)) errors.push({ line: entry.line, reason: `duplicate findingId: ${record.findingId}` });
			recordEventUuid(record.findingId, "findingId", entry.line);

			let antecedent: ReviewLedgerFindingRecord | undefined;
			if (record.repeatsFindingId !== undefined) {
				antecedent = findingsById.get(record.repeatsFindingId)?.record;
				if (!antecedent) errors.push({ line: entry.line, reason: "repeatsFindingId must resolve to a strictly earlier v2 finding" });
			} else if (record.repeatsLegacyLine !== undefined) {
				const target = entriesByLine.get(record.repeatsLegacyLine);
				if (!target || target.line >= entry.line || "schemaVersion" in target.record || !isFindingRecord(target.record)) {
					errors.push({ line: entry.line, reason: "repeatsLegacyLine must resolve to a strictly earlier unversioned finding" });
				} else antecedent = target.record;
			}
			if (antecedent) {
				const incompatibility = compatibleAntecedent(record, antecedent);
				if (incompatibility) errors.push({ line: entry.line, reason: incompatibility });
			}
			if (!findingsById.has(record.findingId)) findingsById.set(record.findingId, { line: entry.line, record });
		}

		if (isUntaggedV2Record(record)) {
			const existingRun = runs.get(record.runId);
			const kind = isFindingRecord(record) ? "findings" : "pass";
			if (!existingRun) {
				if (taggedRuns.has(record.runId)) errors.push({ line: entry.line, reason: `runId ${record.runId} is already used by a tagged review-run` });
				runs.set(record.runId, { line: entry.line, record, kind, count: 1 });
				continue;
			}
			if (!matchRelationshipFields(existingRun.record, record, REVIEW_LEDGER_RELATIONSHIPS.untaggedRunConsistentFields)) {
				errors.push({ line: entry.line, reason: `runId ${record.runId} has incompatible issue, cycle, source, or workerSkillPack metadata` });
			}
			if (existingRun.kind !== kind) errors.push({ line: entry.line, reason: `runId ${record.runId} cannot mix PASS with findings` });
			else if (kind === "pass") errors.push({ line: entry.line, reason: `runId ${record.runId} must contain exactly one verdict-only PASS` });
			existingRun.count += 1;
			continue;
		}

		if (!isTaggedRecord(record)) continue;
		if (record.recordType === TAGGED_RUN_TYPE) {
			if (activeTaggedRun && activeTaggedRun.findings.length !== activeTaggedRun.record.findingIds.length) {
				errors.push({
					line: entry.line,
					reason: `tagged review-run ${record.runId} cannot begin before review-run ${activeTaggedRun.record.runId} has all declared findings`,
				});
			}
			if (taggedRuns.has(record.runId) || runs.has(record.runId)) {
				errors.push({ line: entry.line, reason: `duplicate review runId: ${record.runId}` });
				activeTaggedRun = undefined;
			} else {
				activeTaggedRun = { line: entry.line, record, findings: [], published: false, recapped: false };
				taggedRuns.set(record.runId, activeTaggedRun);
			}
			continue;
		}
		const run = taggedRuns.get(record.runId);
		if (run && activeTaggedRun !== run) {
			errors.push({ line: entry.line, reason: `tagged ${record.recordType} must be contiguous with its review-run batch` });
		}
		if (record.recordType === TAGGED_FINDING_TYPE) {
			if (!run) {
				errors.push({ line: entry.line, reason: "tagged finding runId must resolve to a strictly earlier tagged review-run" });
				continue;
			}
			if (run.published || run.recapped) errors.push({ line: entry.line, reason: "tagged findings must precede publications and recap for their review-run" });
			if (!matchRelationshipFields(run.record, record, REVIEW_LEDGER_RELATIONSHIPS.taggedRunConsistentFields)) {
				errors.push({ line: entry.line, reason: `finding ${record.findingId} must match its review-run metadata` });
			}
			run.findings.push(record);
			continue;
		}
		if (record.recordType === TAGGED_PUBLICATION_TYPE) {
			recordEventUuid(record.publicationId, "publicationId", entry.line);
			if (externalKeys.has(record.externalKey)) errors.push({ line: entry.line, reason: `duplicate publication externalKey: ${record.externalKey}` });
			else externalKeys.set(record.externalKey, entry.line);
			if (!run) errors.push({ line: entry.line, reason: "publication runId must resolve to a strictly earlier tagged review-run" });
			else if (run.recapped) errors.push({ line: entry.line, reason: "publication must precede recap for its review-run" });
			else if (run.findings.length !== run.record.findingIds.length) errors.push({ line: entry.line, reason: "publication must follow all findings declared by its review-run" });
			else if (!matchRelationshipFields(run.record, record, REVIEW_LEDGER_RELATIONSHIPS.taggedPublicationConsistentFields)) {
				errors.push({ line: entry.line, reason: "publication must match its review-run identity" });
			}
			if (run) run.published = true;
			if (run && record.findingId !== undefined) {
				const finding = findingsById.get(record.findingId);
				if (!finding || !("recordType" in finding.record) || finding.record.runId !== record.runId) {
					errors.push({ line: entry.line, reason: "publication findingId must resolve to a strictly earlier finding in its review-run" });
				}
			}
			continue;
		}
		recordEventUuid(record.recapId, "recapId", entry.line);
		const cadenceKey = `${record.issue}:${record.pullRequest}:${record.subjectSha}`;
		if (recapCadences.has(cadenceKey)) errors.push({ line: entry.line, reason: `recap already recorded for issue ${record.issue}, pull request ${record.pullRequest}, and Subject SHA ${record.subjectSha}` });
		else recapCadences.set(cadenceKey, entry.line);
		if (!run) errors.push({ line: entry.line, reason: "recap runId must resolve to a strictly earlier tagged review-run" });
		else if (run.findings.length !== run.record.findingIds.length) errors.push({ line: entry.line, reason: "recap must follow all findings declared by its review-run" });
		else if (!matchRelationshipFields(run.record, record, REVIEW_LEDGER_RELATIONSHIPS.taggedRecapConsistentFields)) {
			errors.push({ line: entry.line, reason: "recap must match its review-run issue, pullRequest, source, and subjectSha" });
		}
		if (run) run.recapped = true;
	}

	for (const { line, record, findings } of taggedRuns.values()) {
		const observedIds = findings.map((finding) => finding.findingId);
		if (record.findingIds.length !== observedIds.length || record.findingIds.some((id, index) => id !== observedIds[index])) {
			errors.push({ line, reason: `review-run ${record.runId} findingIds must exactly match its following findings in order` });
		}
		if (findings.length > 0) {
			const hasBlockingFinding = findings.some((finding) => finding.verdict === "BLOCKER");
			const inconsistent = (hasBlockingFinding && record.verdict !== "BLOCKER")
				|| (!hasBlockingFinding && record.verdict === "BLOCKER" && record.suppressedDuplicateCount === 0);
			if (inconsistent) errors.push({ line, reason: `review-run ${record.runId} verdict must match observed findings before duplicate suppression` });
		}
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
