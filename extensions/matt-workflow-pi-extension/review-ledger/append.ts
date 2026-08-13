import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dlopen, FFIType } from "bun:ffi";
import { parseReviewLedger, validateReviewLedgerRecord, type ReviewLedgerRecord } from "./schema";

const REVIEW_LEDGER_PATH = ".pi/matt-review-ledger.jsonl";

type AppendReviewLedgerInput = Record<string, unknown>;
type AppendReviewLedgerResult = { ledgerPath: string; record: ReviewLedgerRecord };

const LOCK_EXCLUSIVE = 2;
const LOCK_UN = 8;

const FLOCK_SYMBOL = {
	flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
} as const;
type FlockLibrary = ReturnType<typeof dlopen<typeof FLOCK_SYMBOL>>;
let flockLibrary: FlockLibrary | undefined;

function linuxLibcCandidates(): string[] {
	const reportHeader = process.report?.getReport().header as { glibcVersionRuntime?: string } | undefined;
	if (reportHeader?.glibcVersionRuntime) return ["libc.so.6"];
	const muslArchitecture = process.arch === "x64"
		? "x86_64"
		: process.arch === "arm64"
			? "aarch64"
			: undefined;
	if (!muslArchitecture) {
		throw new Error(`review ledger locking is unsupported on Linux ${process.arch} with a non-glibc libc`);
	}
	return [`/lib/ld-musl-${muslArchitecture}.so.1`, `libc.musl-${muslArchitecture}.so.1`];
}

function loadFlockLibrary(): FlockLibrary {
	if (flockLibrary) return flockLibrary;
	const candidates = process.platform === "linux"
		? linuxLibcCandidates()
		: process.platform === "darwin"
			? ["/usr/lib/libSystem.B.dylib"]
			: undefined;
	if (!candidates) throw new Error(`review ledger locking is unsupported on platform ${process.platform}`);
	const failures: string[] = [];
	for (const libraryPath of candidates) {
		try {
			flockLibrary = dlopen(libraryPath, FLOCK_SYMBOL);
			return flockLibrary;
		} catch (error) {
			failures.push(`${libraryPath}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	throw new Error(`review ledger locking is unavailable on ${process.platform}/${process.arch}: ${failures.join("; ")}`);
}

function ledgerLockPath(absoluteLedgerPath: string): string {
	const canonicalLedgerPath = path.join(realpathSync(path.dirname(absoluteLedgerPath)), path.basename(absoluteLedgerPath));
	const identity = createHash("sha256").update(canonicalLedgerPath).digest("hex");
	const userIdentity = typeof process.getuid === "function" ? process.getuid() : "unknown";
	return path.join(tmpdir(), `matt-review-ledger-locks-${userIdentity}`, `${identity}.lock`);
}

function requireOwnedPath(targetPath: string, expectedType: "directory" | "regular file", label: string): void {
	const status = lstatSync(targetPath);
	if (status.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${targetPath}`);
	const typeMatches = expectedType === "directory" ? status.isDirectory() : status.isFile();
	if (!typeMatches) throw new Error(`${label} must be a ${expectedType}: ${targetPath}`);
	if (typeof process.getuid === "function" && status.uid !== process.getuid()) {
		throw new Error(`${label} must be owned by the current user: ${targetPath}`);
	}
}

function prepareLockDirectory(lockDirectory: string): void {
	try {
		mkdirSync(lockDirectory, { mode: 0o700 });
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
	}
	requireOwnedPath(lockDirectory, "directory", "review ledger lock directory");
	chmodSync(lockDirectory, 0o700);
	const securedStatus = lstatSync(lockDirectory);
	if (securedStatus.isSymbolicLink() || !securedStatus.isDirectory()) {
		throw new Error(`review ledger lock directory changed while securing it: ${lockDirectory}`);
	}
	if (typeof process.getuid === "function" && securedStatus.uid !== process.getuid()) {
		throw new Error(`review ledger lock directory must be owned by the current user: ${lockDirectory}`);
	}
}

function requireSafeOpenLockFile(descriptor: number, lockPath: string): void {
	const pathStatus = lstatSync(lockPath);
	const descriptorStatus = fstatSync(descriptor);
	if (pathStatus.isSymbolicLink() || !pathStatus.isFile()) {
		throw new Error(`review ledger lock file changed while opening it: ${lockPath}`);
	}
	if (pathStatus.dev !== descriptorStatus.dev || pathStatus.ino !== descriptorStatus.ino) {
		throw new Error(`review ledger lock file changed while opening it: ${lockPath}`);
	}
	if (pathStatus.nlink !== 1 || descriptorStatus.nlink !== 1) {
		throw new Error(`review ledger lock file must not have multiple hard links: ${lockPath}`);
	}
}

function openLockFile(lockPath: string): number {
	let descriptor: number;
	const previousUmask = process.umask(0);
	try {
		descriptor = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
		requireOwnedPath(lockPath, "regular file", "review ledger lock file");
		descriptor = openSync(lockPath, constants.O_RDWR | constants.O_NOFOLLOW);
	} finally {
		process.umask(previousUmask);
	}
	try {
		const status = fstatSync(descriptor);
		if (!status.isFile()) throw new Error(`review ledger lock file must be a regular file: ${lockPath}`);
		if (typeof process.getuid === "function" && status.uid !== process.getuid()) {
			throw new Error(`review ledger lock file must be owned by the current user: ${lockPath}`);
		}
		if (status.nlink > 1) throw new Error(`review ledger lock file must not have multiple hard links: ${lockPath}`);
		if ((status.mode & 0o7777) !== 0o600) throw new Error(`review ledger lock file must have mode 0600: ${lockPath}`);
		requireSafeOpenLockFile(descriptor, lockPath);
		return descriptor;
	} catch (error) {
		closeSync(descriptor);
		throw error;
	}
}

function withLedgerLock<T>(absoluteLedgerPath: string, operation: () => T): T {
	const flock = loadFlockLibrary();
	mkdirSync(path.dirname(absoluteLedgerPath), { recursive: true });
	const lockPath = ledgerLockPath(absoluteLedgerPath);
	prepareLockDirectory(path.dirname(lockPath));
	const lockDescriptor = openLockFile(lockPath);
	try {
		requireSafeOpenLockFile(lockDescriptor, lockPath);
		if (flock.symbols.flock(lockDescriptor, LOCK_EXCLUSIVE) !== 0) {
			throw new Error(`failed to acquire review ledger lock: ${lockPath}`);
		}
		requireSafeOpenLockFile(lockDescriptor, lockPath);
		return operation();
	} finally {
		flock.symbols.flock(lockDescriptor, LOCK_UN);
		closeSync(lockDescriptor);
	}
}

function isV2Record(record: ReviewLedgerRecord): record is Extract<ReviewLedgerRecord, { schemaVersion: 2 }> {
	return "schemaVersion" in record;
}

function validateAppendDiscipline(existingRecords: readonly ReviewLedgerRecord[], record: ReviewLedgerRecord): string | undefined {
	if (!isV2Record(record)) return "new ledger records must use schemaVersion 2";

	if (record.source === "ai-gate") {
		const earlierGateRecord = existingRecords.find((existing) => (
			existing.issue === record.issue
			&& existing.source === "ai-gate"
			&& (!isV2Record(existing) || existing.runId !== record.runId)
		));
		if (earlierGateRecord) {
			const identity = isV2Record(earlierGateRecord) ? ` under runId ${earlierGateRecord.runId}` : " in a legacy record";
			return `AI-gate execution already recorded for issue ${record.issue}${identity}`;
		}
	}

	return undefined;
}

function appendReviewLedgerRecord(options: {
	cwd: string;
	input: AppendReviewLedgerInput;
	runId?: string;
}): AppendReviewLedgerResult {
	const ledgerPath = REVIEW_LEDGER_PATH;
	const absoluteLedgerPath = path.resolve(realpathSync(options.cwd), ledgerPath);
	return withLedgerLock(absoluteLedgerPath, () => {
		let existingContents = "";
		let existingRecords: ReviewLedgerRecord[] = [];

		if (existsSync(absoluteLedgerPath)) {
			existingContents = readFileSync(absoluteLedgerPath, "utf8");
			if (existingContents.trim().length > 0) {
				const parsed = parseReviewLedger(existingContents);
				if (!parsed.ok) {
					const reasons = parsed.errors.map((error) => `line ${error.line}: ${error.reason}`).join("; ");
					throw new Error(`existing ledger is invalid: ${reasons}`);
				}
				existingRecords = parsed.records;
			}
		}

		for (const stampedField of ["schemaVersion", "date", "runId"] as const) {
			if (stampedField in options.input) throw new Error(`${stampedField} is stamped by the append command and must be omitted`);
		}
		const recordInput = {
			...options.input,
			schemaVersion: 2,
			date: new Date().toISOString(),
			runId: options.runId ?? crypto.randomUUID(),
		};
		const validation = validateReviewLedgerRecord(recordInput);
		if (!validation.ok) throw new Error(validation.reason);
		const disciplineError = validateAppendDiscipline(existingRecords, validation.record);
		if (disciplineError) throw new Error(disciplineError);

		const candidateContents = `${existingContents}${existingContents.length > 0 && !existingContents.endsWith("\n") ? "\n" : ""}${JSON.stringify(validation.record)}\n`;
		const candidateValidation = parseReviewLedger(candidateContents);
		if (!candidateValidation.ok) {
			const appendLine = candidateContents.trimEnd().split("\n").length;
			const reason = candidateValidation.errors.find((error) => error.line === appendLine)?.reason
				?? candidateValidation.errors.map((error) => `line ${error.line}: ${error.reason}`).join("; ");
			throw new Error(reason);
		}

		appendFileSync(absoluteLedgerPath, `${existingContents.length > 0 && !existingContents.endsWith("\n") ? "\n" : ""}${JSON.stringify(validation.record)}\n`, "utf8");
		return { ledgerPath, record: validation.record };
	});
}

function parseArguments(args: string[]): { repoRoot: string; record: AppendReviewLedgerInput; runId?: string } {
	let repoRoot: string | undefined;
	let recordJson: string | undefined;
	let runId: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		const nextValue = () => {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
			index += 1;
			return value;
		};
		if (argument === "--repo-root") repoRoot = nextValue();
		else if (argument === "--record") recordJson = nextValue();
		else if (argument === "--run-id") runId = nextValue();
		else throw new Error(`unknown argument: ${argument}`);
	}
	if (!repoRoot || !recordJson) throw new Error("usage: bun review-ledger/append.ts --repo-root <path> --record '<json>' [--run-id <uuidv4>]");
	let record: unknown;
	try {
		record = JSON.parse(recordJson);
	} catch {
		throw new Error("--record must be valid JSON");
	}
	if (typeof record !== "object" || record === null || Array.isArray(record)) throw new Error("--record must be a JSON object");
	return { repoRoot, record: record as AppendReviewLedgerInput, ...(runId ? { runId } : {}) };
}

function runAppendReviewLedgerCli(args: string[]): void {
	const options = parseArguments(args);
	const result = appendReviewLedgerRecord({ cwd: path.resolve(options.repoRoot), input: options.record, runId: options.runId });
	console.log(JSON.stringify({ ok: true, ledgerPath: result.ledgerPath, runId: isV2Record(result.record) ? result.record.runId : undefined }));
}

if (import.meta.main) {
	try {
		runAppendReviewLedgerCli(Bun.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
