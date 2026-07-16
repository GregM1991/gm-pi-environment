import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import mattWorkflowExtension, { isWayfinderPlanningIssue, phasePrompt } from "./index";

function withRepo(run: (cwd: string) => void): void {
	const cwd = mkdtempSync(path.join(tmpdir(), "matt-workflow-test-"));
	try { run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("planning phase contracts", () => {
	test("spec uses current upstream skill and preserves local gates", () => withRepo((cwd) => {
		const prompt = phasePrompt("spec", "#1", cwd);
		expect(prompt).toContain("engineering/to-spec/SKILL.md");
		expect(prompt).toContain("confirm proposed test seams");
		expect(prompt).toContain("milestone");
		expect(prompt).toContain("/matt-refactors");
		expect(prompt).toContain("/matt-tickets");
	}));

	test("tickets uses blocking edges, parent-index augmentation, and routing hints", () => withRepo((cwd) => {
		const prompt = phasePrompt("tickets", "#1", cwd, "Issue-aware skill routing for ticket creation:");
		expect(prompt).toContain("engineering/to-tickets/SKILL.md");
		expect(prompt).toContain("native blocking relationships");
		expect(prompt).toContain("generated ## Child issues section");
		expect(prompt).toContain("MATT-GRILL-NOTES.md");
		expect(prompt).toContain("Issue-aware skill routing for ticket creation");
	}));

	test("wayfinder stays planning-only, preserves HITL, and hands off to spec", () => withRepo((cwd) => {
		const prompt = phasePrompt("wayfinder", "large destination", cwd);
		expect(prompt).toContain("engineering/wayfinder/SKILL.md");
		expect(prompt).toContain("productivity/grilling/SKILL.md");
		expect(prompt).toContain("never implement destination work");
		expect(prompt).toContain("HITL grilling and prototype tickets require the live user");
		expect(prompt).toContain("/matt-spec");
		expect(prompt).toContain("resolves exactly one decision ticket per session");
		expect(prompt).toContain("research ticket may use parallel research subagents");
	}));
});

describe("Wayfinder automation boundaries", () => {
	test("classifies every Wayfinder label case-insensitively", () => {
		for (const label of ["wayfinder:map", "wayfinder:research", "wayfinder:prototype", "wayfinder:grilling", "wayfinder:task", "WayFinder:Research"]) {
			expect(isWayfinderPlanningIssue({ labels: [label] })).toBe(true);
		}
		expect(isWayfinderPlanningIssue({ labels: ["ready-for-agent", "bug"] })).toBe(false);
	});

	test("AFK and auto prompts exclude maps and decision tickets", () => withRepo((cwd) => {
		const afk = phasePrompt("afk", "ready-for-agent", cwd);
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(afk).toContain("wayfinder:map or wayfinder:*");
		expect(auto).toContain("Re-check Wayfinder classification after every queue refresh");
		expect(auto).toContain("at most three fix/review cycles per issue");
		expect(auto).toContain("must continue while fewer than three fix/review cycles have been used");
		expect(auto).toContain("parent orchestrator exclusively owns review launches");
		expect(auto).toContain("builtin `worker` agent for implementation and fix children");
		expect(auto).toContain("builtin `reviewer` agent for review children");
		expect(auto).toContain('context: "fresh"');
		expect(auto).toContain("not to review, commit, close issues, or launch subagents");
	}));

	test("auto orchestrator waits for running children without polling or mid-child inspection", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(auto).toContain("Never poll a running child with status/process checks");
		expect(auto).toContain("inspect git status, diffs, logs, or other repo state while that child is running");
		expect(auto).toContain("Wait for the child's returned result");
		expect(auto).toContain("attention notice for a known-long verification command");
		expect(auto).toContain("continue waiting without taking investigative turns");
		expect(auto).toContain("unless the harness reports the child failed or stalled");
		expect(auto).toContain("does not restrict inspection after the child returns");
		expect(auto).toContain("inspect its diff and verification evidence and append ledger records");
	}));

	test("auto prepares an external per-issue packet for every child contract", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(auto).toContain("before launching any child for it, prepare its review packet");
		expect(auto).toContain("${TMPDIR:-/tmp}/matt-auto-review-packets/<repo-id>/<issue>.md");
		expect(auto).toContain("fetched issue body and acceptance criteria");
		expect(auto).toContain("parent/spec issue reference");
		expect(auto).toContain("complete routing contract and selected skill pack");
		expect(auto).toContain("ADRs, and other durable docs");
		expect(auto).toContain("commands/paths for finding the current diff");
		expect(auto).toContain("compact verification summary, failing cases, and verification log path");
		expect(auto).toContain("absolute review-packet path");
		expect(auto).toContain("read the packet as provided context");
		expect(auto).toContain("independently inspect the actual code and current diff");
		expect(auto).toContain("fix worker");
		expect(auto).toContain("same packet and independent-inspection requirements");
		expect(auto).toContain("collision-safe sanitized `<repo-id>`");
		expect(auto).toContain("directories with mode 0700 and packet files with mode 0600");
		expect(auto).toContain("Delete the issue packet after closeout");
		expect(auto).toContain("all packets created by this run whenever the loop terminates");
		expect(auto).toContain("Never stage or commit them");
		expect(auto).toContain("explicitly excluded from the dirty-worktree stop rule");
		expect(auto).toContain("Ignore the external per-issue review packet entirely");

		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "auto.md"), "utf8");
		expect(augmentation).toContain("canonical `owner/name` from the normalized `origin` URL");
		expect(augmentation).toContain("UTF-8 encode that identity, base64url encode it without padding");
		expect(augmentation).toContain("prefix it with `gh-` or `path-` respectively");
		expect(augmentation).toContain("remove the now-empty `<repo-id>` directory, and remove the packet root if it is empty");
	}));

	test("auto worker and fix contracts keep full verification logs out of handoffs", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(auto).toContain("`.pi/matt-verification/<issue>-<stage>.log`");
		expect(auto).toContain("the three stage forms are `<issue>-initial.log`, `<issue>-fix-<n>.log` where `<n>` is the fix cycle number, and `<issue>-pre-commit.log`");
		expect(auto).toContain("repo-local `.git/info/exclude`");
		expect(auto).toContain("focused tests while editing");
		expect(auto).toContain("`.pi/matt-verification/<issue>-initial.log`");
		expect(auto).toContain("only the verification pass/fail summary, failing cases, and log path");
		expect(auto).toContain("permit it to read that repo-local log on demand");
		expect(auto).toContain("focused tests during intermediate edits");
		expect(auto).toContain("one complete repo check after that fix cycle is complete");
		expect(auto).toContain("`.pi/matt-verification/<issue>-fix-<n>.log`, where `<n>` is the fix cycle number");
		expect(auto).toContain("mandatory pre-commit check when neither changed afterward");
		expect(auto).toContain("`.pi/matt-verification/<issue>-pre-commit.log`");
		expect(auto).toContain("Create `.pi/matt-verification/` with mode 0700 and log files with mode 0600");
		expect(auto).toContain("Delete that issue's logs after closeout");
		expect(auto).toContain("delete all verification logs created by this run whenever the loop terminates");
		expect(auto).not.toContain("mandatory even when the completed implementation or fix cycle already ran the same check");

		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "auto.md"), "utf8");
		expect(augmentation).toContain("`.pi/matt-verification/<issue>-<stage>.log`");
		expect(augmentation).toContain("The three stage forms are `<issue>-initial.log`, `<issue>-fix-<n>.log` where `<n>` is the fix cycle number, and `<issue>-pre-commit.log`");
	}));

	test("auto sequences a completed full check through review bookkeeping to commit without duplication", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		const fullCheck = auto.indexOf("run the complete repo check once when the implementation pass is complete");
		const reviewAppend = auto.indexOf("After every review child returns");
		const noDuplicate = auto.indexOf("routine review result, ledger append, compact summary or review-packet update");
		const commit = auto.indexOf("Create the commit for that issue only if the check passes");
		expect(fullCheck).toBeGreaterThan(-1);
		expect(fullCheck).toBeLessThan(reviewAppend);
		expect(reviewAppend).toBeLessThan(noDuplicate);
		expect(noDuplicate).toBeLessThan(commit);
		expect(auto).toContain("proceed directly to commit");
		expect(auto).toContain("Rerun the complete check immediately before committing only after actual remediation, code changes, or other verification-relevant input changes");
		expect(auto).toContain("If the complete pre-commit check fails, re-enter the fix/review cycle while fewer than three cycles have been used");
		expect(auto).toContain("otherwise stop with the budget-exhausted reason");
		expect(auto).toContain("Never commit on a failing check");
	}));

	test("auto prompt carries the append-only review ledger lifecycle contract", () => withRepo((cwd) => {
		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(auto).toContain("augmentations/auto.md");
		expect(auto).toContain(".pi/matt-review-ledger.jsonl");
		expect(auto).toContain("append-only");
		expect(auto).toContain("closed category taxonomy");
		expect(auto).toContain("exactly as documented in `augmentations/auto.md`");
		expect(auto).not.toContain("Require file:line findings, severity, one-line summaries");
		expect(auto).toContain('source: `review-child`');
		expect(auto).toContain("same issue commit");
		expect(auto).toContain("ledger records appended per source per issue");
		expect(auto).toContain("`repeat: earlier-issue`");
		expect(auto).toContain("`Known recurring pitfalls`");
		expect(auto).toContain("every remaining implementation and fix-child contract");
		expect(auto).toContain("prompt-only; change no file");
		expect(auto).toContain("file exactly one human-triage prevention issue");
		expect(auto).toContain("issue, cycle, category, and `whyMissed`");
		expect(auto).toContain("existing open prevention issue");
		expect(auto).toContain("target-repo `AGENTS.md` guidance, a routed skill, or, strongest, a deterministic toolchain check");
		expect(auto).toContain("never apply any durable guidance, skill, routing, or test-policy change");
		expect(auto).toContain("A first `earlier-issue` repeat only injects and schedules prevention; it never stops the loop");
		expect(auto).toContain("First compare it by judgment against recurring classes already recorded this run");
		expect(auto).toContain("assign it to that class and reuse the class's key");
		expect(auto).toContain("Only for a genuinely new recurring class derive a fresh key with the unchanged normalization");
		expect(auto).toContain("Use the assigned canonical key verbatim for pitfall injection and the stop rule");
		expect(auto).toContain("embed it verbatim in and search for it in prevention issue bodies");
		expect(auto).toContain("after that class's pitfall note was injected");
		expect(auto).toContain("`Guidance-promotion candidates`");
		expect(auto).toContain("If there are no candidates, this section states `none`");
		expect(auto).toContain("issue/cycle ledger references, prevention issues filed or reused");
		expect(auto).toContain("whether the prevention stop rule fired");

		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "auto.md"), "utf8");
		expect(augmentation).toContain("## Recurring-class identity");
		expect(augmentation).toContain("first compare it by judgment against the recurring classes already recorded in the current run");
		expect(augmentation).toContain("assign it to that class and reuse the class's key");
		expect(augmentation).toContain("Only a genuinely new recurring class derives a fresh deterministic key");
		expect(augmentation).toContain("join category and normalized summary as `<category>|<summary>`");
		expect(augmentation).toContain("embed and search for it verbatim in the prevention issue body");
	}));

	test("configured AI gate has a separate source-tagged ledger lifecycle", () => withRepo((cwd) => {
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		writeFileSync(path.join(cwd, ".pi", "matt-conventions.json"), JSON.stringify({
			version: 1,
			toolchain: { runtime: "bun", commands: { aiGate: "bun run ai-gate" } },
		}));

		const auto = phasePrompt("auto", "ready-for-agent", cwd);
		expect(auto).toContain("After the issue's review passes and its commit exists, run the configured AI gate exactly once for that issue, before closeout");
		expect(auto).toContain("Do not run it after review children");
		expect(auto).not.toContain("After every review child returns, run the configured AI gate");
		expect(auto).toContain('source: `ai-gate`');
		expect(auto).toContain("no findings → `PASS`");
		expect(auto).toContain("actionable must-fix or should-fix findings → `FIX`");
		expect(auto).toContain("execution/parsing failure or non-remediable blocking result → `BLOCKER`");
		expect(auto).toContain("blocking `verification-skipped` finding");
		expect(auto).toContain("that issue's review children");
		expect(auto).toContain("normalized location plus summary/evidence");
		expect(auto).toContain("triggers a fix worker and fresh review while fewer than three fix/review cycles have been used");
		expect(auto).toContain("Classify each novel gate finding's repeat value under the unchanged finding-record rules");
		expect(auto).toContain("Any novel gate finding classified `repeat: earlier-issue` enters exactly the same recurring-class machinery as a review-child finding");
		expect(auto).toContain("match it by judgment to recurring classes already recorded this run and reuse a matching class's canonical key");
		expect(auto).toContain("derive a fresh key under `augmentations/auto.md` only for a genuinely new class");
		expect(auto).toContain("inject the pitfall note into every remaining implementation and fix-child contract");
		expect(auto).toContain("file or reuse the prevention issue, and count it toward the prevention stop rule");
		expect(auto).toContain("after all three fix/review cycles have been consumed, stop with the budget-exhausted reason and do not close the issue");
		expect(auto).toContain("fix worker's completed full repo check satisfies the mandatory post-remediation/pre-commit verification requirement");
		expect(auto).toContain("fresh review and ledger bookkeeping do not invalidate it");
		expect(auto).toContain("do not require a second identical complete check before updating the issue commit");
		expect(auto).toContain("Do not run the gate again");
		expect(auto).toContain("Update the existing issue commit to include the appended gate ledger evidence");
		expect(auto).toContain("active implementation/fix worker skill pack");
		expect(auto).toContain("Resolve every gate location to `file:line`");
		const commit = auto.indexOf("Create the commit for that issue");
		const gate = auto.indexOf("run the configured AI gate exactly once");
		const fixCheck = auto.indexOf("fix worker's completed full repo check");
		const updateCommit = auto.indexOf("updating the issue commit");
		const closeout = auto.indexOf("Run closeout logic for that issue");
		expect(commit).toBeGreaterThan(-1);
		expect(gate).toBeGreaterThan(-1);
		expect(fixCheck).toBeGreaterThan(-1);
		expect(updateCommit).toBeGreaterThan(-1);
		expect(closeout).toBeGreaterThan(-1);
		expect(commit).toBeLessThan(gate);
		expect(gate).toBeLessThan(fixCheck);
		expect(fixCheck).toBeLessThan(updateCommit);
		expect(gate).toBeLessThan(closeout);

		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "auto.md"), "utf8");
		expect(augmentation).toContain("run it exactly once per issue");
		expect(augmentation).toContain("after the issue's review has passed and its commit exists, but before closeout");
		expect(augmentation).toContain("Do not run it after review children");
		expect(augmentation).toContain("any review child for that issue");
		expect(augmentation).toContain("committed issue diff");
		expect(augmentation).toContain("Classify each novel gate finding's `repeat` value under the unchanged finding-record rules");
		expect(augmentation).toContain("Any novel AI-gate finding classified `repeat: \"earlier-issue\"` enters exactly the same recurring-class machinery as a review-child finding");
		expect(augmentation).toContain("assign its recurring class and key under **Recurring-class identity**");
		expect(augmentation).toContain("inject the pitfall note into all remaining implementation and fix-child contracts");
		expect(augmentation).toContain("file or reuse the prevention issue, and count it toward the prevention stop rule");
		expect(augmentation).toContain("triggers a fix worker and fresh review while fewer than three fix/review cycles have been used");
		expect(augmentation).toContain("If all three cycles have already been consumed, stop with the budget-exhausted reason and do not close the issue");
		expect(augmentation).toContain("fix worker's completed full check satisfies the mandatory post-remediation/pre-commit verification requirement");
		expect(augmentation).toContain("fresh review and ledger bookkeeping do not invalidate it");
		expect(augmentation).toContain("do not require a second identical complete check before updating the issue commit");
		expect(augmentation).toContain("Do not run the gate again after that review");
		expect(augmentation).not.toContain("run it after every review child");
	}));

	test("fresh review keeps its configured AI gate behavior", () => withRepo((cwd) => {
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		writeFileSync(path.join(cwd, ".pi", "matt-conventions.json"), JSON.stringify({
			version: 1,
			toolchain: { runtime: "bun", commands: { aiGate: "bun run ai-gate" } },
		}));

		const review = phasePrompt("review", "#42", cwd);
		expect(review).toContain("Run the repo AI gate as part of this review");
		expect(review).toContain("The AI gate command was executed");
		expect(review).not.toContain("exactly once for that issue");
	}));

	test("new verdict-only PASS records include source and omit every finding field", () => {
		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "auto.md"), "utf8");
		const passSection = augmentation.split("## Verdict-only PASS record")[1] ?? "";
		const example = passSection.match(/```json\n(.+)\n```/)?.[1];

		expect(passSection).toContain("only `date`, `issue`, `cycle`, `verdict`, and `source`");
		expect(passSection).toContain("`workerSkillPack`");
		expect(example).toBeDefined();
		expect(JSON.parse(example ?? "{}")).toEqual({
			date: "2026-02-24T16:40:00.000Z",
			issue: 42,
			cycle: "fix-2",
			verdict: "PASS",
			source: "review-child",
		});
	});
});

describe("retro phase contract", () => {
	test("requires validated evidence, distinct repeat signals, and per-proposal approval", () => withRepo((cwd) => {
		const prompt = phasePrompt("retro", "", cwd);
		expect(prompt).toContain(`- auto: ${path.join(import.meta.dir, "augmentations", "auto.md")} —`);
		expect(prompt).toContain("augmentations/retro.md");
		expect(prompt).toContain(".pi/matt-review-ledger.jsonl");
		expect(prompt).toContain("missing, empty, or malformed");
		expect(prompt).toContain("report every malformed line with its line number");
		expect(prompt).not.toContain("malformed line numbers");
		expect(prompt).toContain("within one issue");
		expect(prompt).toContain("across issues");
		expect(prompt).toContain("source-less legacy records as `review-child`");
		expect(prompt).toContain("separately for `review-child` and `ai-gate`");
		expect(prompt).toContain("issue/cycle references");
		expect(prompt).toContain("Give cross-issue clusters explicit priority");
		expect(prompt).toContain("propose a prevention tier for every cross-issue cluster");
		expect(prompt).toContain("Prefer a deterministic target-repo toolchain check when feasible");
		expect(prompt).toContain("target-repo deterministic toolchain checks");
		expect(prompt).toContain("explicit per-proposal approval");
		const augmentation = readFileSync(path.join(import.meta.dir, "augmentations", "retro.md"), "utf8");
		expect(augmentation).toContain("Give cross-issue clusters explicit priority");
		expect(augmentation).toContain("Prevention tier for every across-issue proposal");
		expect(augmentation).toContain("deterministic target-repo check, target-repo guidance, or routed skill");
		expect(prompt).toContain("applied and skipped");
		expect(prompt).toContain("Never rewrite, compact, or modify the ledger");
		expect(prompt).toContain("vendor/mattpocock-skills");
		expect(prompt).not.toContain("Architecture learning lens");
		expect(prompt).not.toContain("improve-codebase-architecture/SKILL.md");
		expect(prompt).not.toContain("Target:");
	}));
});

describe("command registration", () => {
	test("registers canonical planning and insight commands", () => {
		const names: string[] = [];
		mattWorkflowExtension({ on() {}, registerCommand(name: string) { names.push(name); } } as never);
		expect(names).toContain("matt-spec");
		expect(names).toContain("matt-tickets");
		expect(names).toContain("matt-wayfinder");
		expect(names).toContain("matt-retro");
		expect(names).not.toContain("matt-prd");
		expect(names).not.toContain("matt-slice");
	});

	test("retro is ledger-wide and offers no issue-target completions", () => {
		type RegisteredCommand = { getArgumentCompletions?: (prefix: string) => unknown };
		let retro: RegisteredCommand | undefined;
		let spec: RegisteredCommand | undefined;
		mattWorkflowExtension({
			on() {},
			registerCommand(name: string, command: RegisteredCommand) {
				if (name === "matt-retro") retro = command;
				if (name === "matt-spec") spec = command;
			},
		} as never);

		expect(retro?.getArgumentCompletions).toBeUndefined();
		expect(spec?.getArgumentCompletions).toBeFunction();
	});

	test("includes retro in the matt-profile summary", async () => {
		let profile: { handler: (args: string, ctx: unknown) => Promise<void> } | undefined;
		mattWorkflowExtension({
			on() {},
			registerCommand(name: string, command: typeof profile) { if (name === "matt-profile") profile = command; },
		} as never);
		let summary = "";
		await profile?.handler("", { ui: { notify(message: string) { summary = message; } } });
		expect(summary).toContain("/matt-retro");
	});
});
