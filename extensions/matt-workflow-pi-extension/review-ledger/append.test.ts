import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const CLI_PATH = path.join(import.meta.dir, "append.ts");
const tempDirectories: string[] = [];
const tempLockArtifacts: string[] = [];

function makeRepo(): string {
	const directory = mkdtempSync(path.join(tmpdir(), "matt-ledger-append-"));
	tempDirectories.push(directory);
	return directory;
}

function cliArgs(repoRoot: string, record: unknown, runId?: string): string[] {
	const args = [CLI_PATH, "--repo-root", repoRoot, "--record", JSON.stringify(record)];
	if (runId) args.push("--run-id", runId);
	return args;
}

function runCli(repoRoot: string, record: unknown, runId?: string, env?: NodeJS.ProcessEnv, preloadPath?: string) {
	return spawnSync("bun", [...(preloadPath ? [`--preload=${preloadPath}`] : []), ...cliArgs(repoRoot, record, runId)], {
		cwd: import.meta.dir,
		encoding: "utf8",
		env: env ? { ...process.env, ...env } : process.env,
	});
}

function runBatchCli(repoRoot: string, records: unknown[]) {
	return spawnSync("bun", [CLI_PATH, "--repo-root", repoRoot, "--batch", JSON.stringify(records)], {
		cwd: import.meta.dir,
		encoding: "utf8",
	});
}

function runDescribeCli(cwd: string) {
	return spawnSync("bun", [CLI_PATH, "--describe"], {
		cwd,
		encoding: "utf8",
	});
}

function runCliAsync(repoRoot: string, record: unknown, runId?: string): Promise<{ status: number | null; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn("bun", cliArgs(repoRoot, record, runId), { cwd: import.meta.dir, stdio: ["ignore", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.on("error", reject);
		child.on("close", (status) => resolve({ status, stderr }));
	});
}

function waitForPath(targetPath: string, timeoutMs = 5_000): void {
	const deadline = Date.now() + timeoutMs;
	while (!existsSync(targetPath)) {
		if (Date.now() >= deadline) throw new Error(`timed out waiting for path: ${targetPath}`);
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
	}
}

function lockPathForRepo(repoRoot: string, temporaryRoot = tmpdir()): string {
	const ledgerPath = path.join(repoRoot, ".pi", "matt-review-ledger.jsonl");
	const identity = createHash("sha256").update(ledgerPath).digest("hex");
	const userIdentity = typeof process.getuid === "function" ? process.getuid() : "unknown";
	return path.join(temporaryRoot, `matt-review-ledger-locks-${userIdentity}`, `${identity}.lock`);
}

function spawnLockHolder(repoRoot: string, lockPath: string) {
	mkdirSync(path.dirname(lockPath), { recursive: true });
	const preloadPath = path.join(repoRoot, `lock-holder-${crypto.randomUUID()}.ts`);
	const readyPath = path.join(path.dirname(lockPath), `lock-ready-${crypto.randomUUID()}`);
	const ledgerPath = path.join(repoRoot, ".pi", "matt-review-ledger.jsonl");
	tempLockArtifacts.push(readyPath);
	writeFileSync(preloadPath, `
import { mock } from "bun:test";
import * as fs from "node:fs";
const originalExistsSync = fs.existsSync;
let holding = false;
mock.module("node:fs", () => ({
	...fs,
	existsSync(targetPath: fs.PathLike) {
		const exists = originalExistsSync(targetPath);
		if (!holding && targetPath === ${JSON.stringify(ledgerPath)}) {
			holding = true;
			fs.writeFileSync(${JSON.stringify(readyPath)}, "ready");
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
		}
		return exists;
	},
}));
`);
	const child = spawn("bun", [`--preload=${preloadPath}`, ...cliArgs(repoRoot, { ...passInput, issue: 999 })], { stdio: "ignore" });
	waitForPath(readyPath);
	return { child, readyPath };
}

const passInput = {
	issue: 42,
	cycle: "initial",
	verdict: "PASS",
	source: "review-child",
	workerSkillPack: ["implement", "tdd"],
};

const findingInput = {
	issue: 42,
	cycle: "initial",
	verdict: "FIX",
	source: "review-child",
	workerSkillPack: ["implement", "tdd"],
	findingId: "00000000-0000-4000-8000-000000000002",
	location: "src/parser.ts:27",
	severity: "medium",
	summary: "Empty input bypasses validation",
	category: "correctness",
	whyMissed: "The worker did not test empty input",
	repeat: "none",
};

const taggedBatchInput = [{
	recordType: "review-run",
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
}, {
	recordType: "finding",
	issue: 50,
	pullRequest: 70,
	cycle: "initial",
	source: "review-child",
	runId: "00000000-0000-4000-8000-000000000010",
	workerSkillPack: ["implement", "tdd"],
	subjectSha: "a".repeat(40),
	verdict: "FIX",
	findingId: "00000000-0000-4000-8000-000000000011",
	location: "src/delivery.ts:20",
	severity: "medium",
	summary: "Delivery evidence is incomplete",
	category: "correctness",
	whyMissed: "The final evidence link was omitted",
	repeat: "none",
}];

const taggedPublicationInput = {
	recordType: "publication",
	publicationId: "00000000-0000-4000-8000-000000000012",
	issue: 50,
	pullRequest: 70,
	subjectSha: "a".repeat(40),
	source: "review-child",
	runId: "00000000-0000-4000-8000-000000000010",
	findingId: "00000000-0000-4000-8000-000000000011",
	provider: "github",
	surface: "pr-review-thread",
	externalKey: "PRRT_kwDOexample",
};

const taggedRecapInput = {
	recordType: "recap",
	recapId: "00000000-0000-4000-8000-000000000013",
	issue: 50,
	pullRequest: 70,
	subjectSha: "a".repeat(40),
	source: "review-child",
	runId: "00000000-0000-4000-8000-000000000010",
	impactClass: "extends",
	displayedRisk: "medium",
	touchedRecapPrimitiveIds: ["review-ledger"],
	removedRecapPrimitiveIds: [],
	touchedInvariantIds: ["append-only"],
};

afterEach(() => {
	for (const artifact of tempLockArtifacts.splice(0)) rmSync(artifact, { force: true });
	for (const directory of tempDirectories.splice(0)) {
		rmSync(lockPathForRepo(directory), { force: true });
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("review ledger append CLI", () => {
	test("describes the validation contract without creating or modifying a ledger", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const ledgerPath = path.join(cwd, ".pi", "matt-review-ledger.jsonl");
		writeFileSync(ledgerPath, "existing ledger marker\n");

		const result = runDescribeCli(cwd);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		const description = JSON.parse(result.stdout);
		expect(description).toMatchObject({
			schemaVersion: 2,
			mutatesLedger: false,
			commandStampedFields: ["schemaVersion", "date"],
			taxonomies: {
				sources: ["review-child", "ai-gate"],
				cycles: ["initial", "fix-1", "fix-2", "fix-3"],
				verdicts: ["PASS", "FIX", "BLOCKER"],
				categories: ["spec-miss", "correctness", "test-gap", "convention-violation", "architecture", "verification-skipped"],
				repeats: ["none", "earlier-cycle", "earlier-issue"],
				severitiesBySource: {
					"review-child": ["high", "medium", "low", "blocking"],
					"ai-gate": ["must-fix", "should-fix", "non-remediable-blocker", "blocking"],
				},
				recordTypes: ["review-run", "finding", "publication", "recap"],
				publicationSurfaces: ["pr-review-summary", "pr-review-thread"],
				recapImpactClasses: ["composes", "extends", "adds"],
				recapRisks: ["low", "medium", "high"],
			},
			recordShapes: {
				untaggedV2Pass: {
					required: ["schemaVersion", "date", "issue", "cycle", "verdict", "source", "runId", "workerSkillPack"],
					optional: [],
				},
				taggedPublication: {
					required: ["schemaVersion", "recordType", "date", "publicationId", "issue", "pullRequest", "subjectSha", "source", "runId", "provider", "surface", "externalKey"],
					optional: ["findingId", "url"],
				},
			},
			relationships: {
				taggedBatchOrder: ["review-run", "finding", "publication", "recap"],
				untaggedRunConsistentFields: ["issue", "cycle", "source", "workerSkillPack"],
				taggedRunConsistentFields: ["issue", "pullRequest", "source", "subjectSha"],
				repeatAntecedentFields: ["repeatsFindingId", "repeatsLegacyLine"],
				recapRiskByImpactClass: { composes: "low", extends: "medium", adds: "high" },
			},
		});
		expect(readFileSync(ledgerPath, "utf8")).toBe("existing ledger marker\n");
		expect(readdirSync(path.join(cwd, ".pi"))).toEqual(["matt-review-ledger.jsonl"]);
		for (const [index, category] of description.taxonomies.categories.entries()) {
			const categoryRepo = makeRepo();
			const categoryResult = runCli(categoryRepo, {
				...findingInput,
				findingId: `00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
				category,
			});
			expect(categoryResult.status).toBe(0);
		}
	});

	test("appends a valid v2 record while stamping its date and run identity", () => {
		const cwd = makeRepo();
		const result = runCli(cwd, passInput);

		expect(result.status).toBe(0);
		const response = JSON.parse(result.stdout);
		expect(response).toMatchObject({ ok: true, ledgerPath: ".pi/matt-review-ledger.jsonl" });
		expect(response.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

		const ledger = readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8");
		expect(ledger.endsWith("\n")).toBe(true);
		const record = JSON.parse(ledger.trim());
		expect(record).toMatchObject({ ...passInput, schemaVersion: 2, runId: response.runId });
		expect(new Date(record.date).toISOString()).toBe(record.date);
	});

	test("appends to an existing empty ledger", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		writeFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "");

		expect(runCli(cwd, passInput).status).toBe(0);
		expect(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim()).not.toBe("");
	});

	test("leaves no untracked runtime lock state in the target repository", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		writeFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "");
		expect(spawnSync("git", ["init", "--quiet"], { cwd }).status).toBe(0);
		expect(spawnSync("git", ["add", ".pi/matt-review-ledger.jsonl"], { cwd }).status).toBe(0);
		expect(spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "fixture"], { cwd }).status).toBe(0);

		expect(runCli(cwd, passInput).status).toBe(0);
		const status = spawnSync("git", ["status", "--short", "--untracked-files=all"], { cwd, encoding: "utf8" });
		expect(status.status).toBe(0);
		expect(status.stdout).toBe(" M .pi/matt-review-ledger.jsonl\n");
	});

	test("creates a mode-0600 lock and appends when the CLI inherits a restrictive umask", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const temporaryRoot = makeRepo();
		const lockPath = lockPathForRepo(cwd, temporaryRoot);

		const result = spawnSync("sh", ["-c", 'umask 0777; exec "$@"', "sh", "bun", ...cliArgs(cwd, passInput)], {
			cwd: import.meta.dir,
			encoding: "utf8",
			env: { ...process.env, TMPDIR: temporaryRoot },
		});

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(lstatSync(lockPath).mode & 0o777).toBe(0o600);
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(true);
	});

	test("rejects an incorrectly-modeled existing lock without replacing or chmodding it", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const temporaryRoot = makeRepo();
		const lockPath = lockPathForRepo(cwd, temporaryRoot);
		mkdirSync(path.dirname(lockPath), { recursive: true });
		chmodSync(path.dirname(lockPath), 0o777);
		writeFileSync(lockPath, "");
		chmodSync(lockPath, 0o666);
		const originalInode = lstatSync(lockPath).ino;

		const result = runCli(cwd, passInput, undefined, { TMPDIR: temporaryRoot });

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review ledger lock file must have mode 0600");
		expect(lstatSync(path.dirname(lockPath)).mode & 0o777).toBe(0o700);
		expect(lstatSync(lockPath).mode & 0o777).toBe(0o666);
		expect(lstatSync(lockPath).ino).toBe(originalInode);
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects a hardlinked temporary lock file without changing its mode", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const temporaryRoot = makeRepo();
		const lockPath = lockPathForRepo(cwd, temporaryRoot);
		mkdirSync(path.dirname(lockPath), { recursive: true });
		writeFileSync(lockPath, "");
		chmodSync(lockPath, 0o666);
		const hardlinkPath = path.join(temporaryRoot, "lock-hardlink");
		linkSync(lockPath, hardlinkPath);

		const result = runCli(cwd, passInput, undefined, { TMPDIR: temporaryRoot });

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review ledger lock file must not have multiple hard links");
		expect(lstatSync(lockPath).mode & 0o777).toBe(0o666);
		expect(lstatSync(hardlinkPath).mode & 0o777).toBe(0o666);
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects a hardlink injected at the former fchmod boundary without changing either name's mode", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const temporaryRoot = makeRepo();
		const lockPath = lockPathForRepo(cwd, temporaryRoot);
		mkdirSync(path.dirname(lockPath), { recursive: true });
		writeFileSync(lockPath, "");
		chmodSync(lockPath, 0o600);
		const hardlinkPath = path.join(temporaryRoot, "lock-hardlink-at-chmod");
		const preloadPath = path.join(cwd, "hardlink-at-chmod.ts");
		writeFileSync(preloadPath, `
import { mock } from "bun:test";
import * as fs from "node:fs";
const originalFstatSync = fs.fstatSync;
let descriptorChecks = 0;
mock.module("node:fs", () => ({
	...fs,
	fstatSync(descriptor: number) {
		const status = originalFstatSync(descriptor);
		descriptorChecks += 1;
		if (descriptorChecks === 2) {
			fs.linkSync(${JSON.stringify(lockPath)}, ${JSON.stringify(hardlinkPath)});
			fs.chmodSync(${JSON.stringify(lockPath)}, 0o666);
		}
		return status;
	},
}));
`);

		const result = runCli(cwd, passInput, undefined, { TMPDIR: temporaryRoot }, preloadPath);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review ledger lock file must not have multiple hard links");
		expect(lstatSync(lockPath).mode & 0o777).toBe(0o666);
		expect(lstatSync(hardlinkPath).mode & 0o777).toBe(0o666);
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects a hardlink added at the flock boundary without appending under the unsafe lock", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const temporaryRoot = makeRepo();
		const lockPath = lockPathForRepo(cwd, temporaryRoot);
		mkdirSync(path.dirname(lockPath), { recursive: true });
		writeFileSync(lockPath, "");
		chmodSync(lockPath, 0o600);
		const hardlinkPath = path.join(temporaryRoot, "lock-hardlink-at-flock");
		const flockMarkerPath = path.join(temporaryRoot, "flock-called");
		const preloadPath = path.join(cwd, "hardlink-at-flock.ts");
		writeFileSync(preloadPath, `
import { mock } from "bun:test";
import * as fs from "node:fs";
import * as ffi from "bun:ffi";
const originalDlopen = ffi.dlopen;
mock.module("bun:ffi", () => ({
	...ffi,
	dlopen(...args: Parameters<typeof originalDlopen>) {
		const library = originalDlopen(...args);
		return {
			...library,
			symbols: {
				...library.symbols,
				flock(descriptor: number, operation: number) {
					fs.appendFileSync(${JSON.stringify(flockMarkerPath)}, String(operation));
					if (operation === 2) fs.linkSync(${JSON.stringify(lockPath)}, ${JSON.stringify(hardlinkPath)});
					return library.symbols.flock(descriptor, operation);
				},
			},
		};
	},
}));
`);

		const result = runCli(cwd, passInput, undefined, { TMPDIR: temporaryRoot }, preloadPath);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review ledger lock file must not have multiple hard links");
		expect(readFileSync(flockMarkerPath, "utf8")).toBe("28");
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects symbolic-link and non-regular temporary lock entries", () => {
		for (const unsafeType of ["symbolic link", "directory"] as const) {
			const cwd = makeRepo();
			mkdirSync(path.join(cwd, ".pi"), { recursive: true });
			const temporaryRoot = makeRepo();
			const lockPath = lockPathForRepo(cwd, temporaryRoot);
			mkdirSync(path.dirname(lockPath), { recursive: true });
			if (unsafeType === "symbolic link") {
				const target = path.join(temporaryRoot, "lock-target");
				writeFileSync(target, "");
				symlinkSync(target, lockPath);
			} else {
				mkdirSync(lockPath);
			}

			const result = runCli(cwd, passInput, undefined, { TMPDIR: temporaryRoot });

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain(unsafeType === "symbolic link"
				? "review ledger lock file must not be a symbolic link"
				: "review ledger lock file must be a regular file");
			expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
		}
	});

	test("rejects a symbolic-link temporary lock directory", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const temporaryRoot = makeRepo();
		const lockPath = lockPathForRepo(cwd, temporaryRoot);
		const redirectedDirectory = path.join(temporaryRoot, "redirected-locks");
		mkdirSync(redirectedDirectory);
		symlinkSync(redirectedDirectory, path.dirname(lockPath));

		const result = runCli(cwd, passInput, undefined, { TMPDIR: temporaryRoot });

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review ledger lock directory must not be a symbolic link");
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects a temporary lock directory not owned by the effective user", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const temporaryRoot = makeRepo();
		const actualUser = process.getuid?.() ?? 0;
		const simulatedUser = actualUser + 1;
		const lockDirectory = path.join(temporaryRoot, `matt-review-ledger-locks-${simulatedUser}`);
		mkdirSync(lockDirectory);
		const preloadPath = path.join(cwd, "different-user.ts");
		writeFileSync(preloadPath, `Object.defineProperty(process, "getuid", { value: () => ${simulatedUser} });\n`);

		const result = spawnSync("bun", ["--preload", preloadPath, ...cliArgs(cwd, passInput)], {
			cwd: import.meta.dir,
			encoding: "utf8",
			env: { ...process.env, TMPDIR: temporaryRoot },
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review ledger lock directory must be owned by the current user");
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("reports an unsupported locking platform through the CLI instead of failing during module loading", () => {
		const cwd = makeRepo();
		const preloadPath = path.join(cwd, "unsupported-platform.ts");
		writeFileSync(preloadPath, 'Object.defineProperty(process, "platform", { value: "win32" });\n');

		const result = spawnSync("bun", ["--preload", preloadPath, ...cliArgs(cwd, passInput)], {
			cwd: import.meta.dir,
			encoding: "utf8",
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review ledger locking is unsupported on platform win32");
		expect(result.stderr).not.toContain("dlopen");
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects caller-supplied stamped fields", () => {
		const cwd = makeRepo();
		const result = runCli(cwd, { ...passInput, date: "2020-01-01T00:00:00.000Z" });

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("date is stamped by the append command and must be omitted");
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects malformed and out-of-taxonomy input without creating a ledger", () => {
		const cwd = makeRepo();
		const result = runCli(cwd, { ...findingInput, category: "style" });

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("category is not in the closed taxonomy");
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("rejects PASS mixed with findings in either order for one run", () => {
		const findingThenPass = makeRepo();
		const firstRunId = "00000000-0000-4000-8000-000000000010";
		expect(runCli(findingThenPass, findingInput, firstRunId).status).toBe(0);
		const rejectedPass = runCli(findingThenPass, passInput, firstRunId);
		expect(rejectedPass.status).not.toBe(0);
		expect(rejectedPass.stderr).toContain(`runId ${firstRunId} cannot mix PASS with findings`);
		expect(readFileSync(path.join(findingThenPass, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);

		const passThenFinding = makeRepo();
		const secondRunId = "00000000-0000-4000-8000-000000000011";
		expect(runCli(passThenFinding, passInput, secondRunId).status).toBe(0);
		const rejectedFinding = runCli(passThenFinding, findingInput, secondRunId);
		expect(rejectedFinding.status).not.toBe(0);
		expect(rejectedFinding.stderr).toContain(`runId ${secondRunId} cannot mix PASS with findings`);
		expect(readFileSync(path.join(passThenFinding, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
	});

	test("rejects a reused finding identity before appending", () => {
		const cwd = makeRepo();
		const firstRunId = "00000000-0000-4000-8000-000000000015";
		const secondRunId = "00000000-0000-4000-8000-000000000016";
		expect(runCli(cwd, findingInput, firstRunId).status).toBe(0);

		const duplicate = runCli(cwd, { ...findingInput, location: "src/parser.ts:41" }, secondRunId);
		expect(duplicate.status).not.toBe(0);
		expect(duplicate.stderr).toContain(`duplicate findingId: ${findingInput.findingId}`);
		expect(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
	});

	test("rejects an AI-gate execution when legacy gate evidence already exists for the issue", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		writeFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), `${JSON.stringify({
			date: "2026-02-24T16:40:00.000Z",
			issue: 42,
			cycle: "initial",
			verdict: "PASS",
			source: "ai-gate",
		})}\n`);

		const result = runCli(cwd, { ...passInput, source: "ai-gate" });
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("AI-gate execution already recorded for issue 42");
	});

	test("rejects a second AI-gate execution for an issue but allows more findings in the same run", () => {
		const cwd = makeRepo();
		const firstRunId = "00000000-0000-4000-8000-000000000020";
		const secondRunId = "00000000-0000-4000-8000-000000000021";
		const gateFinding = { ...findingInput, source: "ai-gate", severity: "must-fix" };
		const secondGateFinding = {
			...gateFinding,
			findingId: "00000000-0000-4000-8000-000000000003",
			location: "src/parser.ts:41",
		};

		expect(runCli(cwd, gateFinding, firstRunId).status).toBe(0);
		expect(runCli(cwd, secondGateFinding, firstRunId).status).toBe(0);
		const repeatedGate = runCli(cwd, { ...passInput, source: "ai-gate" }, secondRunId);

		expect(repeatedGate.status).not.toBe(0);
		expect(repeatedGate.stderr).toContain("AI-gate execution already recorded for issue 42");
		expect(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
	});

	test("atomically appends a complete tagged batch in canonical order", () => {
		const cwd = makeRepo();
		const result = runBatchCli(cwd, taggedBatchInput);

		expect(result.status).toBe(0);
		const response = JSON.parse(result.stdout);
		expect(response).toEqual({ ok: true, ledgerPath: ".pi/matt-review-ledger.jsonl", appended: 2 });
		const records = readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
		expect(records.map((record) => record.recordType)).toEqual(["review-run", "finding"]);
		expect(records.every((record) => record.schemaVersion === 2 && typeof record.date === "string")).toBe(true);
	});

	test("appends single-record PASS and duplicate-only tagged batches", () => {
		for (const reviewRun of [{
			...taggedBatchInput[0],
			verdict: "PASS",
			findingIds: [],
			suppressedDuplicateCount: 0,
		}, {
			...taggedBatchInput[0],
			findingIds: [],
			suppressedDuplicateCount: 2,
		}]) {
			const cwd = makeRepo();
			const result = runBatchCli(cwd, [reviewRun]);

			expect(result.status).toBe(0);
			expect(JSON.parse(result.stdout)).toEqual({ ok: true, ledgerPath: ".pi/matt-review-ledger.jsonl", appended: 1 });
			expect(JSON.parse(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8"))).toMatchObject(reviewRun);
		}
	});

	test("reports the final candidate JSONL line when atomically rejecting a tagged batch", () => {
		const cwd = makeRepo();
		const result = runBatchCli(cwd, [
			taggedBatchInput[0],
			{ ...taggedBatchInput[1], subjectSha: "b".repeat(40) },
		]);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(`line 2: finding ${taggedBatchInput[1].findingId} must match its review-run metadata`);
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
	});

	test("reports the candidate line for malformed tagged record shape after existing history", () => {
		const cwd = makeRepo();
		expect(runBatchCli(cwd, taggedBatchInput).status).toBe(0);
		const nextBatch = taggedBatchInput.map((record) => ({
			...record,
			cycle: "fix-1",
			runId: "00000000-0000-4000-8000-000000000020",
			...(record.recordType === "review-run"
				? { findingIds: ["00000000-0000-4000-8000-000000000021"] }
				: { findingId: "00000000-0000-4000-8000-000000000021", subjectSha: "not-a-full-sha" }),
		}));

		const result = runBatchCli(cwd, nextBatch);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("line 4: subjectSha must be a full lowercase Git SHA");
		expect(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
	});

	test("reports the candidate line for tagged append cadence failures", () => {
		const cwd = makeRepo();
		expect(runBatchCli(cwd, taggedBatchInput).status).toBe(0);
		const duplicateCadence = taggedBatchInput.map((record) => ({
			...record,
			runId: "00000000-0000-4000-8000-000000000020",
			...(record.recordType === "review-run" ? { findingIds: ["00000000-0000-4000-8000-000000000021"] } : { findingId: "00000000-0000-4000-8000-000000000021" }),
		}));

		const result = runBatchCli(cwd, duplicateCadence);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("line 3: review run already recorded for issue 50, pull request 70, cycle initial, source review-child, and Subject SHA");
		expect(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
	});

	test("rejects event UUID reuse across finding, publication, and recap records", () => {
		const collisions = [
			[...taggedBatchInput, { ...taggedPublicationInput, publicationId: taggedBatchInput[1].findingId }],
			[...taggedBatchInput, { ...taggedRecapInput, recapId: taggedBatchInput[1].findingId }],
			[...taggedBatchInput, taggedPublicationInput, { ...taggedRecapInput, recapId: taggedPublicationInput.publicationId }],
		];

		for (const batch of collisions) {
			const cwd = makeRepo();
			const result = runBatchCli(cwd, batch);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("event UUID");
			expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
		}
	});

	test("rejects standalone tagged events with their physical candidate line without changing valid history", () => {
		for (const standaloneEvent of [taggedBatchInput[1], taggedPublicationInput, taggedRecapInput]) {
			const cwd = makeRepo();
			expect(runBatchCli(cwd, taggedBatchInput).status).toBe(0);
			const ledgerPath = path.join(cwd, ".pi", "matt-review-ledger.jsonl");
			const before = readFileSync(ledgerPath, "utf8");

			const result = runBatchCli(cwd, [standaloneEvent]);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("line 3: --batch must contain one complete tagged review batch in canonical order");
			expect(readFileSync(ledgerPath, "utf8")).toBe(before);
		}
	});

	test("rejects untagged and mixed tagged/untagged batches atomically with physical candidate lines", () => {
		const taggedPass = {
			...taggedBatchInput[0],
			verdict: "PASS",
			findingIds: [],
			suppressedDuplicateCount: 0,
		};
		for (const [invalidBatch, line] of [[[passInput], 1], [[taggedPass, passInput], 2]] as const) {
			const cwd = makeRepo();
			const result = runBatchCli(cwd, [...invalidBatch]);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain(`line ${line}: --batch accepts tagged records only`);
			expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
		}
	});

	test("refuses partial, contradictory, out-of-order, and cadence-violating tagged batches", () => {
		for (const invalidBatch of [
			[taggedBatchInput[0]],
			[taggedBatchInput[1], taggedBatchInput[0]],
			[taggedBatchInput[0], { ...taggedBatchInput[1], subjectSha: "b".repeat(40) }],
		]) {
			const cwd = makeRepo();
			const result = runBatchCli(cwd, invalidBatch);
			expect(result.status).not.toBe(0);
			expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);
		}

		const cadenceRepo = makeRepo();
		expect(runBatchCli(cadenceRepo, taggedBatchInput).status).toBe(0);
		const duplicateCadence = taggedBatchInput.map((record) => ({
			...record,
			runId: "00000000-0000-4000-8000-000000000020",
			...(record.recordType === "review-run" ? { findingIds: ["00000000-0000-4000-8000-000000000021"] } : { findingId: "00000000-0000-4000-8000-000000000021" }),
		}));
		const result = runBatchCli(cadenceRepo, duplicateCadence);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("review run already recorded for issue 50, pull request 70, cycle initial, source review-child, and Subject SHA");
		expect(readFileSync(path.join(cadenceRepo, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
	});

	test("recovers when a process dies while holding the ledger lock", () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const lockPath = lockPathForRepo(cwd);
		const holder = spawnLockHolder(cwd, lockPath);
		holder.child.kill("SIGKILL");
		const result = runCli(cwd, passInput);
		expect(result.status).toBe(0);
		expect(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim()).not.toBe("");
	});

	test("does not reclaim a ledger lock held by a live process", async () => {
		const cwd = makeRepo();
		mkdirSync(path.join(cwd, ".pi"), { recursive: true });
		const lockPath = lockPathForRepo(cwd);
		const holder = spawnLockHolder(cwd, lockPath);
		const append = spawn("bun", cliArgs(cwd, passInput), { cwd: import.meta.dir, stdio: ["ignore", "pipe", "pipe"] });
		await Bun.sleep(150);

		expect(append.exitCode).toBeNull();
		expect(existsSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"))).toBe(false);

		holder.child.kill("SIGKILL");
		await new Promise<void>((resolve) => append.on("close", () => resolve()));
		expect(append.exitCode).toBe(0);
		expect(readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim()).not.toBe("");
	});

	test("serializes concurrent AI-gate appends so only one execution is recorded", async () => {
		const cwd = makeRepo();
		const gatePass = { ...passInput, source: "ai-gate" };
		const attempts = Array.from({ length: 12 }, (_, index) => (
			runCliAsync(cwd, gatePass, `00000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}`)
		));

		const results = await Promise.all(attempts);
		const successes = results.filter((result) => result.status === 0);
		const rejections = results.filter((result) => result.status !== 0);
		expect(successes).toHaveLength(1);
		expect(rejections).toHaveLength(11);
		expect(rejections.every((result) => result.stderr.includes("AI-gate execution already recorded for issue 42"))).toBe(true);

		const ledgerLines = readFileSync(path.join(cwd, ".pi", "matt-review-ledger.jsonl"), "utf8").trim().split("\n");
		expect(ledgerLines).toHaveLength(1);
		expect(JSON.parse(ledgerLines[0])).toMatchObject({ issue: 42, source: "ai-gate", verdict: "PASS" });
		expect(readdirSync(path.join(cwd, ".pi"))).toEqual(["matt-review-ledger.jsonl"]);
	});
});
