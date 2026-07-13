import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { phasePrompt } from "./index";

describe("Matt auto-loop review budget", () => {
	test("continues through three concrete fix/review cycles before stopping", () => {
		const cwd = mkdtempSync(path.join(tmpdir(), "matt-auto-loop-"));

		try {
			const prompt = phasePrompt("auto", "#123", cwd);

			expect(prompt).toContain("at most three fix/review cycles per issue");
			expect(prompt).toContain("A FIX or BLOCKER verdict with concrete repo-local changes is fixable");
			expect(prompt).toContain("must continue while fewer than three fix/review cycles have been used");
			expect(prompt).toContain("Do not stop merely because a reviewer labels a concrete correctness finding as BLOCKER");
			expect(prompt).toContain("cycle 3");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
