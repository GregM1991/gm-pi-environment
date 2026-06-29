import { describe, expect, test } from "bun:test";
import { __testing } from "./index";

const { buildNamingPrompt, formatTranscript, isStaleExtensionContextError } = __testing;

describe("buildNamingPrompt", () => {
	test("instructs the model to title the session arc and user goal, not assistant activity", () => {
		const prompt = buildNamingPrompt(
			[
				{ role: "user", text: "I want session names to be less technical." },
				{ role: "assistant", text: "I'll inspect the implementation." },
			],
			"Inspect Auto Rename Prompt",
		);

		expect(prompt).toContain("whole session arc");
		expect(prompt).toContain("the user's goal across the conversation");
		expect(prompt).toContain("Describe what the user wants, not what the assistant is executing");
		expect(prompt).toContain("Keep the current title only when it already captures the user goal and session arc well");
		expect(prompt).toContain("Avoid assistant-action titles like Inspect, Analyze, Debug, Update, Implement, or Refactor");
	});

	test("allows concise titles up to 15 words without forcing 10 to 15 words", () => {
		const prompt = buildNamingPrompt([{ role: "user", text: "Name this better." }], undefined);

		expect(prompt).toContain("Prefer concise outcome-oriented wording; use up to 15 words when needed for context");
		expect(prompt).not.toContain("10 to 15 words");
	});
});

describe("isStaleExtensionContextError", () => {
	test("recognizes Pi stale extension context errors", () => {
		expect(
			isStaleExtensionContextError(
				new Error("This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx."),
			),
		).toBe(true);
		expect(isStaleExtensionContextError(new Error("other failure"))).toBe(false);
		expect(isStaleExtensionContextError("This extension ctx is stale after session replacement or reload")).toBe(false);
	});
});

describe("formatTranscript", () => {
	test("preserves the beginning and recent end when transcript exceeds the cap", () => {
		const transcript = formatTranscript(
			[
				{ role: "user", text: `ORIGIN ${"a".repeat(80)}` },
				{ role: "assistant", text: `MIDDLE ${"b".repeat(80)}` },
				{ role: "user", text: `${"c".repeat(80)} RECENT` },
			],
			120,
		);

		expect(transcript).toContain("ORIGIN");
		expect(transcript).toContain("RECENT");
		expect(transcript).toContain("middle transcript omitted");
		expect(transcript).not.toContain("MIDDLE");
	});
});
