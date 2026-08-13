import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dlopen, FFIType } from "bun:ffi";
import { parseReviewLedger, validateReviewLedgerRecord, type ReviewLedgerRecord } from "./schema";

const REVIEW_LEDGER_PATH = ".pi/matt-review-ledger.jsonl";

type AppendReviewLedgerInput = Record<string, unknown>;
type AppendReviewLedgerResult = { ledgerPath: string; records: ReviewLedgerRecord[] };

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

function isTaggedRun(record: ReviewLedgerRecord): record is Extract<ReviewLedgerRecord, { recordType: "review-run" }> {
	return "recordType" in record && record.recordType === "review-run";
}

function validateAppendDiscipline(existingRecords: readonly ReviewLedgerRecord[], record: ReviewLedgerRecord): string | undefined {
	if (!isV2Record(record)) return "new ledger records must use schemaVersion 2";

	if (isTaggedRun(record)) {
		const priorRun = existingRecords.find((existing) => isTaggedRun(existing)
			&& existing.issue === record.issue && existing.pullRequest === record.pullRequest
			&& existing.cycle === record.cycle && existing.source === record.source && existing.subjectSha === record.subjectSha);
		if (priorRun) return `review run already recorded for issue ${record.issue}, pull request ${record.pullRequest}, cycle ${record.cycle}, source ${record.source}, and Subject SHA ${record.subjectSha}`;
	}

	if ("source" in record && record.source === "ai-gate") {
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

function validateTaggedBatch(records: readonly ReviewLedgerRecord[], firstCandidateLine: number): void {
	const untaggedIndex = records.findIndex((record) => !("recordType" in record));
	if (untaggedIndex !== -1) {
		throw new Error(`line ${firstCandidateLine + untaggedIndex}: --batch accepts tagged records only`);
	}
	const reviewRunIndexes = records.flatMap((record, index) => isTaggedRun(record) ? [index] : []);
	if (reviewRunIndexes.length !== 1 || reviewRunIndexes[0] !== 0) {
		const offendingIndex = reviewRunIndexes.length > 1 ? reviewRunIndexes[1] : 0;
		throw new Error(`line ${firstCandidateLine + offendingIndex}: --batch must contain one complete tagged review batch in canonical order`);
	}
	const reviewRuns = records.filter(isTaggedRun);
	const run = reviewRuns[0];
	let phase: "finding" | "publication" | "recap" = "finding";
	let findingIndex = 0;
	for (const [index, record] of records.slice(1).entries()) {
		if (!("recordType" in record)) continue;
		const line = firstCandidateLine + index + 1;
		if (record.runId !== run.runId) throw new Error(`line ${line}: batch record must belong to review-run ${run.runId}`);
		if (record.recordType === "finding") {
			if (phase !== "finding") throw new Error(`line ${line}: tagged findings must precede publications and recap`);
			if (record.findingId !== run.findingIds[findingIndex]) {
				throw new Error(`line ${line}: review-run ${run.runId} findingIds must exactly match its following findings in order`);
			}
			findingIndex += 1;
		} else if (record.recordType === "publication") {
			if (phase === "recap") throw new Error(`line ${line}: publication must precede recap for its review-run`);
			phase = "publication";
		} else if (record.recordType === "recap") {
			if (phase === "recap") throw new Error(`line ${line}: --batch may contain at most one recap`);
			phase = "recap";
		} else {
			throw new Error(`line ${line}: --batch must contain one complete tagged review batch in canonical order`);
		}
	}
	if (findingIndex !== run.findingIds.length) {
		throw new Error(`line ${firstCandidateLine}: review-run ${run.runId} findingIds must exactly match its following findings in order`);
	}
}

function appendReviewLedgerRecords(options: {
	cwd: string;
	inputs: AppendReviewLedgerInput[];
	runId?: string;
	batch: boolean;
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

		if (options.inputs.length === 0) throw new Error("batch must contain at least one record");
		const separator = existingContents.length > 0 && !existingContents.endsWith("\n") ? "\n" : "";
		const firstCandidateLine = (existingContents.match(/\n/g)?.length ?? 0) + 1 + (separator ? 1 : 0);
		const stampedRecords: ReviewLedgerRecord[] = [];
		for (const input of options.inputs) {
			const candidateLine = firstCandidateLine + stampedRecords.length;
			for (const stampedField of ["schemaVersion", "date"] as const) {
				if (stampedField in input) {
					const reason = `${stampedField} is stamped by the append command and must be omitted`;
					throw new Error(options.batch ? `line ${candidateLine}: ${reason}` : reason);
				}
			}
			const tagged = "recordType" in input;
			if ("runId" in input && !(options.batch && tagged)) {
				const reason = "runId is stamped by the append command and must be omitted";
				throw new Error(options.batch ? `line ${candidateLine}: ${reason}` : reason);
			}
			const recordInput = {
				...input,
				schemaVersion: 2,
				date: new Date().toISOString(),
				...(!tagged ? { runId: options.runId ?? crypto.randomUUID() } : {}),
			};
			const validation = validateReviewLedgerRecord(recordInput);
			if (!validation.ok) throw new Error(options.batch ? `line ${candidateLine}: ${validation.reason}` : validation.reason);
			const disciplineError = validateAppendDiscipline([...existingRecords, ...stampedRecords], validation.record);
			if (disciplineError) throw new Error(options.batch ? `line ${candidateLine}: ${disciplineError}` : disciplineError);
			stampedRecords.push(validation.record);
		}

		if (options.batch) validateTaggedBatch(stampedRecords, firstCandidateLine);

		const appendedContents = `${stampedRecords.map((record) => JSON.stringify(record)).join("\n")}\n`;
		const candidateContents = `${existingContents}${separator}${appendedContents}`;
		const candidateValidation = parseReviewLedger(candidateContents);
		if (!candidateValidation.ok) {
			const reasons = candidateValidation.errors.map((error) => `line ${error.line}: ${error.reason}`).join("; ");
			throw new Error(reasons);
		}

		appendFileSync(absoluteLedgerPath, `${separator}${appendedContents}`, "utf8");
		return { ledgerPath, records: stampedRecords };
	});
}

function parseArguments(args: string[]): { repoRoot: string; records: AppendReviewLedgerInput[]; runId?: string; batch: boolean } {
	let repoRoot: string | undefined;
	let recordJson: string | undefined;
	let batchJson: string | undefined;
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
		else if (argument === "--batch") batchJson = nextValue();
		else if (argument === "--run-id") runId = nextValue();
		else throw new Error(`unknown argument: ${argument}`);
	}
	if (!repoRoot || Boolean(recordJson) === Boolean(batchJson)) {
		throw new Error("usage: bun review-ledger/append.ts --repo-root <path> (--record '<json>' [--run-id <uuidv4>] | --batch '<json-array>')");
	}
	if (batchJson && runId) throw new Error("--run-id cannot be used with --batch; tagged batch records carry their runId");
	let parsed: unknown;
	try {
		parsed = JSON.parse(recordJson ?? batchJson as string);
	} catch {
		throw new Error(`${recordJson ? "--record" : "--batch"} must be valid JSON`);
	}
	if (recordJson) {
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("--record must be a JSON object");
		return { repoRoot, records: [parsed as AppendReviewLedgerInput], ...(runId ? { runId } : {}), batch: false };
	}
	if (!Array.isArray(parsed) || parsed.some((record) => typeof record !== "object" || record === null || Array.isArray(record))) {
		throw new Error("--batch must be an array of JSON objects");
	}
	return { repoRoot, records: parsed as AppendReviewLedgerInput[], batch: true };
}

function runAppendReviewLedgerCli(args: string[]): void {
	const options = parseArguments(args);
	const result = appendReviewLedgerRecords({ cwd: path.resolve(options.repoRoot), inputs: options.records, runId: options.runId, batch: options.batch });
	const firstRecord = result.records[0];
	console.log(JSON.stringify(options.batch
		? { ok: true, ledgerPath: result.ledgerPath, appended: result.records.length }
		: { ok: true, ledgerPath: result.ledgerPath, runId: firstRecord && "runId" in firstRecord ? firstRecord.runId : undefined }));
}

if (import.meta.main) {
	try {
		runAppendReviewLedgerCli(Bun.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
