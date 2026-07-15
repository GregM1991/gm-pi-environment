import { describe, expect, test } from "bun:test";
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

const reviewFinding = {
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

describe("review ledger schema", () => {
	test("validates a mixed legacy and source-tagged ledger and defaults legacy source", () => {
		const aiGatePass = {
			date: "2026-02-24T16:41:00.000Z",
			issue: 42,
			cycle: "fix-2",
			verdict: "PASS",
			source: "ai-gate",
		};
		const result = parseReviewLedger([legacyPass, reviewFinding, aiGatePass].map((record) => JSON.stringify(record)).join("\n"));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.records.map((record) => record.source)).toEqual(["review-child", "review-child", "ai-gate"]);
		expect(result.records[0]).toEqual({ ...legacyPass, source: "review-child" });
	});

	test("accepts source-tagged PASS and finding shapes", () => {
		expect(validateReviewLedgerRecord({ ...legacyPass, source: "review-child" }).ok).toBe(true);
		expect(validateReviewLedgerRecord(reviewFinding).ok).toBe(true);
		expect(validateReviewLedgerRecord({ ...reviewFinding, source: "ai-gate" }).ok).toBe(true);
	});

	test("rejects invalid sources and malformed record shapes", () => {
		expect(validateReviewLedgerRecord({ ...legacyPass, source: "manual" })).toEqual({
			ok: false,
			reason: "source must be review-child or ai-gate when present",
		});
		expect(validateReviewLedgerRecord({ ...legacyPass, source: "ai-gate", summary: "not allowed" }).ok).toBe(false);
		expect(validateReviewLedgerRecord({ ...legacyPass, date: "2026-02-31T16:40:00.000Z" }).ok).toBe(false);
		expect(validateReviewLedgerRecord({ ...reviewFinding, location: "src/parser.ts" }).ok).toBe(false);
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

describe("AI-gate ledger mapping", () => {
	test("maps PASS, actionable findings, and failures deterministically", () => {
		expect(mapAiGateVerdict({ status: "success", findings: [] })).toBe("PASS");
		expect(mapAiGateVerdict({ status: "success", findings: [{ disposition: "should-fix" }] })).toBe("FIX");
		expect(mapAiGateVerdict({ status: "success", findings: [{ disposition: "non-remediable-blocker" }] })).toBe("BLOCKER");
		expect(mapAiGateVerdict({ status: "failure", findings: [] })).toBe("BLOCKER");
	});

	test("suppresses same-cycle AI-gate duplicates by normalized location and summary or evidence", () => {
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

	test("builds a source-tagged blocking verification-skipped record for gate failure", () => {
		const record = buildAiGateFailureRecord({
			date: "2026-02-24T16:42:00.000Z",
			issue: 42,
			cycle: "fix-2",
			location: ".pi/matt-conventions.json:1",
			summary: "AI gate payload could not be parsed",
			workerSkillPack: ["implement", "tdd"],
		});

		expect(record).toMatchObject({
			source: "ai-gate",
			verdict: "BLOCKER",
			category: "verification-skipped",
			repeat: "none",
		});
		expect(validateReviewLedgerRecord(record).ok).toBe(true);
	});
});
