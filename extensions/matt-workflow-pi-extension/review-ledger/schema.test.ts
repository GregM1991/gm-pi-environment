import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildAiGateFailureRecord,
	findNovelAiGateFindings,
	mapAiGateVerdict,
	parseReviewLedger,
	validateReviewLedgerRecord,
} from "./schema";

const legacyPass = {
	date: "2026-02-24T16:40:00.000Z",
	issue: 42,
	cycle: "fix-2",
	verdict: "PASS",
};

const legacyFinding = {
	date: "2026-02-24T16:30:00.000Z",
	issue: 42,
	cycle: "fix-1",
	verdict: "FIX",
	source: "review-child",
	location: "src/parser.ts:27",
	severity: "major",
	summary: "Empty input bypasses the required validation error",
	category: "spec-miss",
	whyMissed: "The worker covered only the happy path",
	workerSkillPack: ["implement", "tdd"],
	repeat: "none",
};

const v2Finding = {
	schemaVersion: 2,
	date: "2026-02-24T16:30:00.000Z",
	issue: 42,
	cycle: "initial",
	verdict: "FIX",
	source: "review-child",
	runId: "00000000-0000-4000-8000-000000000001",
	workerSkillPack: ["implement", "tdd"],
	findingId: "00000000-0000-4000-8000-000000000002",
	location: "src/parser.ts:27",
	severity: "medium",
	summary: "Empty input bypasses the required validation error",
	category: "spec-miss",
	whyMissed: "The worker covered only the happy path",
	repeat: "none",
};

const v2Pass = {
	schemaVersion: 2,
	date: "2026-02-24T16:40:00.000Z",
	issue: 42,
	cycle: "fix-2",
	verdict: "PASS",
	source: "review-child",
	runId: "00000000-0000-4000-8000-000000000003",
	workerSkillPack: ["implement", "tdd"],
};

const taggedRun = {
	schemaVersion: 2,
	recordType: "review-run",
	date: "2026-02-24T17:00:00.000Z",
	issue: 50,
	pullRequest: 70,
	cycle: "initial",
	source: "review-child",
	runId: "00000000-0000-4000-8000-000000000010",
	workerSkillPack: ["implement", "tdd"],
	subjectSha: "a".repeat(40),
	verdict: "FIX",
	findingIds: ["00000000-0000-4000-8000-000000000011"],
	suppressedDuplicateCount: 0,
};

const taggedFinding = {
	schemaVersion: 2,
	recordType: "finding",
	date: "2026-02-24T17:00:01.000Z",
	issue: 50,
	pullRequest: 70,
	cycle: "initial",
	source: "review-child",
	runId: taggedRun.runId,
	workerSkillPack: ["implement", "tdd"],
	subjectSha: taggedRun.subjectSha,
	verdict: "FIX",
	findingId: taggedRun.findingIds[0],
	location: "src/delivery.ts:20",
	severity: "medium",
	summary: "Delivery evidence is incomplete",
	category: "correctness",
	whyMissed: "The worker omitted the final evidence link",
	repeat: "none",
};

const taggedPublication = {
	schemaVersion: 2,
	recordType: "publication",
	date: "2026-02-24T17:00:02.000Z",
	publicationId: "00000000-0000-4000-8000-000000000012",
	issue: 50,
	pullRequest: 70,
	subjectSha: taggedRun.subjectSha,
	source: "review-child",
	runId: taggedRun.runId,
	findingId: taggedFinding.findingId,
	provider: "github",
	surface: "pr-review-thread",
	externalKey: "PRRT_kwDOexample",
	url: "https://github.com/example/repo/pull/70#discussion_r1",
};

const taggedRecap = {
	schemaVersion: 2,
	recordType: "recap",
	date: "2026-02-24T17:00:03.000Z",
	recapId: "00000000-0000-4000-8000-000000000013",
	issue: 50,
	pullRequest: 70,
	subjectSha: taggedRun.subjectSha,
	source: "review-child",
	runId: taggedRun.runId,
	impactClass: "extends",
	displayedRisk: "medium",
	touchedRecapPrimitiveIds: ["review-ledger"],
	removedRecapPrimitiveIds: [],
	touchedInvariantIds: ["append-only", "producer-identity"],
};

function parseRecords(records: unknown[]) {
	return parseReviewLedger(records.map((record) => JSON.stringify(record)).join("\n"));
}

function expectInvalid(record: unknown, reason: string) {
	expect(validateReviewLedgerRecord(record)).toEqual({ ok: false, reason });
}

describe("review ledger schema", () => {
	test("keeps unversioned legacy validation and source defaulting unchanged", () => {
		const result = parseRecords([legacyPass, legacyFinding, { ...legacyFinding, source: "ai-gate" }]);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.records.map((record) => record.source)).toEqual(["review-child", "review-child", "ai-gate"]);
		expect(result.records[0]).toEqual({ ...legacyPass, source: "review-child" });
		expect(validateReviewLedgerRecord({ ...legacyFinding, severity: "legacy-free-form" }).ok).toBe(true);
	});

	test("validates v2 finding and verdict-only PASS records", () => {
		expect(validateReviewLedgerRecord(v2Finding).ok).toBe(true);
		expect(validateReviewLedgerRecord(v2Pass).ok).toBe(true);
		expect(validateReviewLedgerRecord({ ...v2Finding, severity: "high" }).ok).toBe(true);
		expect(validateReviewLedgerRecord({ ...v2Finding, severity: "low", verdict: "BLOCKER" }).ok).toBe(true);
	});

	test("requires schemaVersion 2, source, and canonical lowercase UUIDv4 run and finding IDs", () => {
		expectInvalid({ ...v2Pass, schemaVersion: 3 }, "schemaVersion must be 2 when present");
		expectInvalid({ ...v2Pass, source: undefined }, "source is required on v2 records");
		expectInvalid({ ...v2Pass, runId: undefined }, "runId must be a canonical lowercase UUIDv4");
		expectInvalid({ ...v2Pass, runId: "00000000-0000-4000-8000-00000000000A" }, "runId must be a canonical lowercase UUIDv4");
		expectInvalid({ ...v2Pass, runId: "00000000-0000-1000-8000-000000000001" }, "runId must be a canonical lowercase UUIDv4");
		expectInvalid({ ...v2Finding, findingId: undefined }, "findingId must be a canonical lowercase UUIDv4");
	});

	test("requires workerSkillPack on every v2 record, findingId only on findings, and omits reviewedCommitSha", () => {
		expectInvalid({ ...v2Pass, workerSkillPack: undefined }, "workerSkillPack must be a non-empty array of skill IDs");
		expectInvalid({ ...v2Finding, workerSkillPack: [] }, "workerSkillPack must be a non-empty array of skill IDs");
		expectInvalid({ ...v2Pass, findingId: "00000000-0000-4000-8000-000000000009" }, "finding record is missing location");
		expectInvalid({ ...v2Pass, reviewedCommitSha: "a".repeat(40) }, "unknown field: reviewedCommitSha");
	});

	test("enforces v2 repeat-reference fields by repeat classification", () => {
		expectInvalid(
			{ ...v2Finding, repeatsFindingId: "00000000-0000-4000-8000-000000000009" },
			"repeat none must omit repeatsFindingId, repeatsLegacyLine, and recurringClassKey",
		);
		expectInvalid({ ...v2Finding, repeat: "earlier-cycle" }, "repeat earlier-cycle requires exactly one antecedent reference");
		expect(validateReviewLedgerRecord({
			...v2Finding,
			repeat: "earlier-cycle",
			repeatsFindingId: "00000000-0000-4000-8000-000000000009",
		}).ok).toBe(true);
		expectInvalid({
			...v2Finding,
			repeat: "earlier-cycle",
			repeatsFindingId: "00000000-0000-4000-8000-000000000009",
			repeatsLegacyLine: 1,
		}, "repeat earlier-cycle requires exactly one antecedent reference");
		expectInvalid({
			...v2Finding,
			repeat: "earlier-issue",
			repeatsLegacyLine: 1,
		}, "repeat earlier-issue requires recurringClassKey");
		expect(validateReviewLedgerRecord({
			...v2Finding,
			repeat: "earlier-issue",
			repeatsLegacyLine: 1,
			recurringClassKey: "spec-miss|empty input bypasses validation #",
		}).ok).toBe(true);
		expectInvalid({
			...v2Finding,
			repeat: "earlier-issue",
			repeatsLegacyLine: 1,
			recurringClassKey: "spec-miss|Empty input!",
		}, "recurringClassKey must use <category>|<normalized-summary>");
		expectInvalid({
			...v2Finding,
			repeat: "earlier-issue",
			repeatsLegacyLine: 0,
			recurringClassKey: "spec-miss|empty input bypasses validation",
		}, "repeatsLegacyLine must be a positive integer");
	});

	test("closes v2 severity vocabularies per source and AI-gate severity/verdict mapping", () => {
		expectInvalid({ ...v2Finding, severity: "major" }, "review-child severity must be high, medium, low, or blocking");
		expectInvalid({ ...v2Finding, severity: "blocking", verdict: "BLOCKER" }, "blocking severity is reserved for synthesized verification-skipped failures");
		expect(validateReviewLedgerRecord({ ...v2Finding, severity: "blocking", verdict: "BLOCKER", category: "verification-skipped" }).ok).toBe(true);
		expect(validateReviewLedgerRecord({ ...v2Finding, source: "ai-gate", severity: "must-fix" }).ok).toBe(true);
		expect(validateReviewLedgerRecord({ ...v2Finding, source: "ai-gate", severity: "should-fix" }).ok).toBe(true);
		expect(validateReviewLedgerRecord({ ...v2Finding, source: "ai-gate", severity: "non-remediable-blocker", verdict: "BLOCKER" }).ok).toBe(true);
		expect(validateReviewLedgerRecord({ ...v2Finding, source: "ai-gate", severity: "blocking", verdict: "BLOCKER", category: "verification-skipped" }).ok).toBe(true);
		expectInvalid({ ...v2Finding, source: "ai-gate", severity: "high" }, "ai-gate severity must be must-fix, should-fix, non-remediable-blocker, or blocking");
		expectInvalid({ ...v2Finding, source: "ai-gate", severity: "must-fix", verdict: "BLOCKER" }, "ai-gate severity must-fix requires verdict FIX");
		expectInvalid({ ...v2Finding, source: "ai-gate", severity: "non-remediable-blocker" }, "ai-gate severity non-remediable-blocker requires verdict BLOCKER");
		expectInvalid({ ...v2Finding, source: "ai-gate", severity: "blocking", verdict: "BLOCKER" }, "ai-gate blocking severity is reserved for verification-skipped failures");
	});

	test("allows only PASS verdict-only records and FIX or BLOCKER v2 findings", () => {
		expectInvalid({ ...v2Pass, verdict: "FIX" }, "verdict-only record must use PASS");
		expectInvalid({ ...v2Finding, verdict: "PASS" }, "v2 finding record must use FIX or BLOCKER");
	});

	test("rejects invalid sources and malformed record shapes", () => {
		expectInvalid({ ...legacyPass, source: "manual" }, "source must be review-child or ai-gate when present");
		expect(validateReviewLedgerRecord({ ...legacyPass, source: "ai-gate", summary: "not allowed" }).ok).toBe(false);
		expect(validateReviewLedgerRecord({ ...legacyPass, date: "2026-02-31T16:40:00.000Z" }).ok).toBe(false);
		expect(validateReviewLedgerRecord({ ...legacyFinding, location: "src/parser.ts" }).ok).toBe(false);
	});

	test("reports every malformed JSONL line", () => {
		const result = parseReviewLedger(`${JSON.stringify(legacyPass)}\nnot-json\n${JSON.stringify({ ...legacyPass, source: "manual" })}`);
		expect(result).toEqual({
			ok: false,
			errors: [
				{ line: 2, reason: "invalid JSON" },
				{ line: 3, reason: "source must be review-child or ai-gate when present" },
			],
		});
	});
});

describe("review ledger v2 relationships", () => {
	test("parses the canonical mixed legacy/v2 migration fixture without modification", () => {
		const fixture = readFileSync(join(import.meta.dir, "fixtures", "mixed-legacy-v2.jsonl"), "utf8");
		const result = parseReviewLedger(fixture);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.records).toHaveLength(5);
		expect(result.records[0]?.source).toBe("review-child");
		expect(result.records[2]).toMatchObject({ schemaVersion: 2, repeatsLegacyLine: 1 });
		expect(result.records[3]).toMatchObject({ schemaVersion: 2, repeatsFindingId: v2Finding.findingId });
		expect(result.records[4]).toMatchObject({ schemaVersion: 2, verdict: "PASS" });
	});

	test("rejects duplicate finding IDs and missing or forward antecedents", () => {
		const duplicate = parseRecords([v2Finding, { ...v2Finding, runId: "00000000-0000-4000-8000-000000000003" }]);
		expect(duplicate).toEqual({ ok: false, errors: [{ line: 2, reason: `duplicate findingId: ${v2Finding.findingId}` }] });

		const missing = parseRecords([{
			...v2Finding,
			cycle: "fix-1",
			repeat: "earlier-cycle",
			repeatsFindingId: "00000000-0000-4000-8000-000000000099",
		}]);
		expect(missing).toEqual({ ok: false, errors: [{ line: 1, reason: "repeatsFindingId must resolve to a strictly earlier v2 finding" }] });

		const forward = parseRecords([{
			...v2Finding,
			cycle: "fix-1",
			repeat: "earlier-cycle",
			repeatsFindingId: "00000000-0000-4000-8000-000000000004",
		}, {
			...v2Finding,
			runId: "00000000-0000-4000-8000-000000000003",
			findingId: "00000000-0000-4000-8000-000000000004",
		}]);
		expect(forward.ok).toBe(false);
		if (forward.ok) return;
		expect(forward.errors).toContainEqual({ line: 1, reason: "repeatsFindingId must resolve to a strictly earlier v2 finding" });

		const forwardLegacyLine = parseRecords([{
			...v2Finding,
			issue: 43,
			repeat: "earlier-issue",
			repeatsLegacyLine: 2,
			recurringClassKey: "spec-miss|empty input bypasses validation",
		}, legacyFinding]);
		expect(forwardLegacyLine.ok).toBe(false);
		if (!forwardLegacyLine.ok) expect(forwardLegacyLine.errors).toContainEqual({ line: 1, reason: "repeatsLegacyLine must resolve to a strictly earlier unversioned finding" });
	});

	test("requires repeat antecedents to match the earlier-cycle or earlier-issue classification", () => {
		const wrongCycle = parseRecords([v2Finding, {
			...v2Finding,
			runId: "00000000-0000-4000-8000-000000000003",
			findingId: "00000000-0000-4000-8000-000000000004",
			repeat: "earlier-cycle",
			repeatsFindingId: v2Finding.findingId,
		}]);
		expect(wrongCycle).toEqual({ ok: false, errors: [{ line: 2, reason: "earlier-cycle antecedent must use the same issue and a strictly earlier cycle" }] });

		const wrongIssue = parseRecords([v2Finding, {
			...v2Finding,
			cycle: "fix-1",
			runId: "00000000-0000-4000-8000-000000000003",
			findingId: "00000000-0000-4000-8000-000000000004",
			repeat: "earlier-issue",
			repeatsFindingId: v2Finding.findingId,
			recurringClassKey: "spec-miss|empty input bypasses validation",
		}]);
		expect(wrongIssue).toEqual({ ok: false, errors: [{ line: 2, reason: "earlier-issue antecedent must use a different issue" }] });

		const wrongCategory = parseRecords([v2Finding, {
			...v2Finding,
			cycle: "fix-1",
			runId: "00000000-0000-4000-8000-000000000003",
			findingId: "00000000-0000-4000-8000-000000000004",
			category: "correctness",
			repeat: "earlier-cycle",
			repeatsFindingId: v2Finding.findingId,
		}]);
		expect(wrongCategory).toEqual({ ok: false, errors: [{ line: 2, reason: "repeat antecedent must use the same category" }] });
	});

	test("enforces one PASS or one-or-more findings per run with consistent metadata", () => {
		const findingRun = parseRecords([v2Finding, {
			...v2Finding,
			findingId: "00000000-0000-4000-8000-000000000004",
			location: "src/parser.ts:41",
		}]);
		expect(findingRun.ok).toBe(true);

		const passMixedWithFinding = parseRecords([v2Pass, { ...v2Finding, cycle: v2Pass.cycle, runId: v2Pass.runId }]);
		expect(passMixedWithFinding.ok).toBe(false);
		if (!passMixedWithFinding.ok) expect(passMixedWithFinding.errors[0]?.reason).toContain("cannot mix PASS with findings");

		const duplicatePass = parseRecords([v2Pass, { ...v2Pass, date: "2026-02-24T16:41:00.000Z" }]);
		expect(duplicatePass.ok).toBe(false);
		if (!duplicatePass.ok) expect(duplicatePass.errors[0]?.reason).toContain("exactly one verdict-only PASS");

		const conflictingMetadata = parseRecords([v2Finding, {
			...v2Finding,
			findingId: "00000000-0000-4000-8000-000000000004",
			issue: 43,
		}]);
		expect(conflictingMetadata.ok).toBe(false);
		if (!conflictingMetadata.ok) expect(conflictingMetadata.errors[0]?.reason).toContain("incompatible issue, cycle, source, or workerSkillPack metadata");
	});
});

describe("tagged v2 review ledger", () => {
	test("preserves legacy and untagged v2 history while validating a complete tagged batch", () => {
		const fixture = readFileSync(join(import.meta.dir, "fixtures", "mixed-legacy-untagged-tagged-v2.jsonl"), "utf8");
		const result = parseReviewLedger(fixture);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.records).toHaveLength(9);
		expect(result.records.slice(0, 5)).toEqual(parseReviewLedger(readFileSync(join(import.meta.dir, "fixtures", "mixed-legacy-v2.jsonl"), "utf8")).records);
		expect(result.records.slice(5).map((record) => "recordType" in record ? record.recordType : undefined)).toEqual([
			"review-run", "finding", "publication", "recap",
		]);
	});

	test("makes the run summary the sole denominator and validates pre-suppression verdict rules", () => {
		expect(parseRecords([{ ...taggedRun, verdict: "PASS", findingIds: [], suppressedDuplicateCount: 0 }]).ok).toBe(true);
		expect(parseRecords([{ ...taggedRun, findingIds: [], suppressedDuplicateCount: 2 }]).ok).toBe(true);
		expect(parseRecords([{ ...taggedRun, verdict: "BLOCKER", findingIds: [], suppressedDuplicateCount: 2 }]).ok).toBe(true);
		expect(parseRecords([{ ...taggedRun, verdict: "PASS", findingIds: [], suppressedDuplicateCount: 1 }])).toEqual({
			ok: false,
			errors: [{ line: 1, reason: "PASS review-run requires no findings and zero suppressed duplicates" }],
		});
		expect(parseRecords([{ ...taggedRun, findingIds: [], suppressedDuplicateCount: 0 }])).toEqual({
			ok: false,
			errors: [{ line: 1, reason: "FIX or BLOCKER review-run requires findings or suppressed duplicates" }],
		});
	});

	test("rejects interleaved tagged batches at the physical boundary line", () => {
		const secondRun = {
			...taggedRun,
			issue: 51,
			pullRequest: 71,
			runId: "00000000-0000-4000-8000-000000000020",
			subjectSha: "b".repeat(40),
			findingIds: ["00000000-0000-4000-8000-000000000021"],
		};
		const secondFinding = {
			...taggedFinding,
			issue: secondRun.issue,
			pullRequest: secondRun.pullRequest,
			runId: secondRun.runId,
			subjectSha: secondRun.subjectSha,
			findingId: secondRun.findingIds[0],
		};

		const result = parseRecords([taggedRun, secondRun, taggedFinding, secondFinding]);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toContainEqual({
			line: 2,
			reason: `tagged review-run ${secondRun.runId} cannot begin before review-run ${taggedRun.runId} has all declared findings`,
		});
	});

	test("enforces tagged run/finding identity, order, Subject SHA, source, and verdict", () => {
		expect(parseRecords([taggedFinding, taggedRun]).ok).toBe(false);
		expect(parseRecords([taggedRun, { ...taggedFinding, subjectSha: "b".repeat(40) }])).toEqual({
			ok: false,
			errors: [{ line: 2, reason: `finding ${taggedFinding.findingId} must match its review-run metadata` }],
		});
		expect(parseRecords([taggedRun, { ...taggedFinding, verdict: "BLOCKER" }])).toEqual({
			ok: false,
			errors: [{ line: 1, reason: `review-run ${taggedRun.runId} verdict must match observed findings before duplicate suppression` }],
		});
		expect(parseRecords([{ ...taggedRun, findingIds: [taggedFinding.findingId, "00000000-0000-4000-8000-000000000099"] }, taggedFinding]).ok).toBe(false);
	});

	test("enforces publication identity, surface mapping, and earlier matching antecedents", () => {
		expect(parseRecords([taggedRun, taggedFinding, taggedPublication]).ok).toBe(true);
		expect(parseRecords([taggedPublication, taggedRun, taggedFinding]).ok).toBe(false);
		expect(parseRecords([taggedRun, taggedFinding, { ...taggedPublication, surface: "pr-review-summary" }])).toEqual({
			ok: false,
			errors: [{ line: 3, reason: "pr-review-summary publication must omit findingId" }],
		});
		expect(parseRecords([taggedRun, taggedFinding, taggedPublication, {
			...taggedPublication,
			publicationId: "00000000-0000-4000-8000-000000000014",
		}]).ok).toBe(false);
	});

	test("enforces recap antecedent, uniqueness, sorted identifiers, and risk mapping", () => {
		expect(parseRecords([taggedRun, taggedFinding, taggedRecap]).ok).toBe(true);
		expect(parseRecords([taggedRecap, taggedRun, taggedFinding]).ok).toBe(false);
		expect(validateReviewLedgerRecord({ ...taggedRecap, touchedInvariantIds: ["z", "a"] })).toEqual({
			ok: false,
			reason: "touchedInvariantIds must be sorted and unique",
		});
		expect(validateReviewLedgerRecord({ ...taggedRecap, displayedRisk: "low" })).toEqual({
			ok: false,
			reason: "extends recap must use displayedRisk medium",
		});
		expect(validateReviewLedgerRecord({ ...taggedRecap, removedRecapPrimitiveIds: ["old-module"] })).toEqual({
			ok: false,
			reason: "recap with removed primitives must use displayedRisk high",
		});
		expect(parseRecords([taggedRun, taggedFinding, taggedRecap, {
			...taggedRecap,
			recapId: "00000000-0000-4000-8000-000000000014",
		}]).ok).toBe(false);
	});

	test("reports tagged relationship failures at their JSONL line", () => {
		const result = parseRecords([taggedRun, taggedFinding, { ...taggedPublication, runId: "00000000-0000-4000-8000-000000000099" }]);
		expect(result).toEqual({
			ok: false,
			errors: [{ line: 3, reason: "publication runId must resolve to a strictly earlier tagged review-run" }],
		});
	});
});

describe("AI-gate ledger mapping", () => {
	test("maps PASS, actionable findings, and failures deterministically", () => {
		expect(mapAiGateVerdict({ status: "success", findings: [] })).toBe("PASS");
		expect(mapAiGateVerdict({ status: "success", findings: [{ disposition: "should-fix" }] })).toBe("FIX");
		expect(mapAiGateVerdict({ status: "success", findings: [{ disposition: "non-remediable-blocker" }] })).toBe("BLOCKER");
		expect(mapAiGateVerdict({ status: "failure", findings: [] })).toBe("BLOCKER");
	});

	test("suppresses per-issue AI-gate duplicates across review cycles by normalized location and summary or evidence", () => {
		const reviewChildFindings = [{
			location: "src/parser.ts:27",
			summary: "Empty input bypasses validation",
			evidence: "parse() accepts an empty string",
		}];
		const aiGateFindings = [
			{ location: "./src/parser.ts:27", summary: " empty input  bypasses validation ", evidence: "different wording" },
			{ location: "src/parser.ts:27", summary: "Different summary", evidence: "PARSE() accepts an empty string" },
			{ location: "src/parser.ts:41", summary: "Whitespace input bypasses validation", evidence: "parse() accepts spaces" },
		];

		expect(findNovelAiGateFindings(reviewChildFindings, aiGateFindings)).toEqual([aiGateFindings[2]]);
	});

	test("builds a v2 blocking verification-skipped record for gate failure", () => {
		const record = buildAiGateFailureRecord({
			date: "2026-02-24T16:42:00.000Z",
			issue: 42,
			cycle: "fix-2",
			runId: "00000000-0000-4000-8000-000000000001",
			findingId: "00000000-0000-4000-8000-000000000002",
			location: ".pi/matt-conventions.json:1",
			summary: "AI gate payload could not be parsed",
			workerSkillPack: ["implement", "tdd"],
		});

		expect(record).toMatchObject({
			schemaVersion: 2,
			source: "ai-gate",
			verdict: "BLOCKER",
			severity: "blocking",
			category: "verification-skipped",
			repeat: "none",
		});
		expect(validateReviewLedgerRecord(record).ok).toBe(true);
	});
});
