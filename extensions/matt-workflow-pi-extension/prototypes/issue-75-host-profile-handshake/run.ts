import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

const root = import.meta.dir;
const packages = {
	consumer: resolve(root, "packages/consumer"),
	providerA: resolve(root, "packages/provider-a"),
	providerB: resolve(root, "packages/provider-b"),
	malformed: resolve(root, "packages/provider-malformed"),
	failing: resolve(root, "packages/provider-failing"),
};

type RpcResponse = {
	id?: string;
	type: string;
	command?: string;
	success?: boolean;
	error?: string;
	data?: unknown;
};

type CaseResult = {
	name: string;
	results: Array<Record<string, unknown>>;
	lifecycle: Array<Record<string, unknown>>;
	stderr: string;
};

function parseJsonLines(text: string): Array<Record<string, unknown>> {
	return text
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function readJsonLines(path: string): Promise<Array<Record<string, unknown>>> {
	try {
		return parseJsonLines(await readFile(path, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

async function runRpcCase(name: string, packagePaths: string[], commands: string[]): Promise<CaseResult> {
	const sandbox = await mkdtemp(join(tmpdir(), "issue-75-host-profile-"));
	const agentDir = join(sandbox, "agent");
	const resultFile = join(sandbox, "results.jsonl");
	const lifecycleFile = join(sandbox, "lifecycle.jsonl");
	await mkdir(agentDir, { recursive: true });
	await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: packagePaths }, null, 2));

	const child = Bun.spawn([
		"pi",
		"--mode", "rpc",
		"--no-session",
		"--no-builtin-tools",
		"--no-skills",
		"--no-prompt-templates",
		"--no-themes",
		"--no-context-files",
		"--approve",
		"--offline",
	], {
		cwd: root,
		env: {
			...process.env,
			PI_CODING_AGENT_DIR: agentDir,
			PI_OFFLINE: "1",
			PROTOTYPE_RESULT_FILE: resultFile,
			PROTOTYPE_LIFECYCLE_FILE: lifecycleFile,
			PROTOTYPE_HOST_AGENT_DIR: process.env.PI_CODING_AGENT_DIR ?? join(process.env.HOME ?? "", ".pi/agent"),
			PROTOTYPE_EXPECTED_PROFILE: "gm.issue-transaction.default",
		},
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});

	const pending = new Map<string, { resolve(value: RpcResponse): void; reject(error: Error): void }>();
	const stdoutDecoder = new StringDecoder("utf8");
	let stdoutBuffer = "";
	const stdoutTask = (async () => {
		for await (const chunk of child.stdout) {
			stdoutBuffer += stdoutDecoder.write(chunk);
			while (true) {
				const newline = stdoutBuffer.indexOf("\n");
				if (newline < 0) break;
				let line = stdoutBuffer.slice(0, newline);
				stdoutBuffer = stdoutBuffer.slice(newline + 1);
				if (line.endsWith("\r")) line = line.slice(0, -1);
				if (!line) continue;
				const message = JSON.parse(line) as RpcResponse;
				if (message.type === "response" && message.id && pending.has(message.id)) {
					pending.get(message.id)?.resolve(message);
					pending.delete(message.id);
				}
			}
		}
		stdoutBuffer += stdoutDecoder.end();
	})();
	const stderrTask = new Response(child.stderr).text();

	let sequence = 0;
	const send = async (command: Record<string, unknown>): Promise<RpcResponse> => {
		const id = `${name}-${++sequence}`;
		const response = new Promise<RpcResponse>((resolveResponse, reject) => {
			pending.set(id, { resolve: resolveResponse, reject });
		});
		child.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
		child.stdin.flush();
		const timeout = setTimeout(() => {
			const waiter = pending.get(id);
			if (!waiter) return;
			pending.delete(id);
			waiter.reject(new Error(`RPC command timed out in '${name}': ${JSON.stringify(command)}`));
		}, 60_000);
		try {
			const value = await response;
			if (!value.success) throw new Error(`RPC command failed in '${name}': ${value.error ?? "unknown error"}`);
			return value;
		} finally {
			clearTimeout(timeout);
		}
	};

	try {
		const listed = await send({ type: "get_commands" });
		const commandList = (listed.data as { commands?: Array<{ name?: string }> } | undefined)?.commands ?? [];
		if (!commandList.some((command) => command.name === "host-profile-probe")) {
			throw new Error(`The consumer package did not load in '${name}'.`);
		}
		for (const command of commands) await send({ type: "prompt", message: command });
	} finally {
		child.kill("SIGTERM");
		await child.exited;
		await stdoutTask;
	}

	const stderr = await stderrTask;
	const result: CaseResult = {
		name,
		results: await readJsonLines(resultFile),
		lifecycle: await readJsonLines(lifecycleFile),
		stderr,
	};
	await rm(sandbox, { recursive: true, force: true });
	return result;
}

function expect(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function one(caseResult: CaseResult): Record<string, unknown> {
	expect(caseResult.results.length === 1, `${caseResult.name}: expected one result, got ${caseResult.results.length}.`);
	return caseResult.results[0];
}

function verify(cases: CaseResult[]): Array<{ name: string; verdict: "PASS"; evidence: string }> {
	const byName = new Map(cases.map((item) => [item.name, item]));
	const evidence: Array<{ name: string; verdict: "PASS"; evidence: string }> = [];
	const pass = (name: string, detail: string) => evidence.push({ name, verdict: "PASS", evidence: detail });

	const consumerFirst = one(byName.get("consumer-before-provider") as CaseResult);
	expect(consumerFirst.status === "resolved" && consumerFirst.offerCountAtEmitReturn === 1, "Consumer-first load order did not resolve exactly one synchronous offer.");
	pass("Consumer before provider", "One valid offer was visible when emit() returned and resolved successfully.");

	const providerFirst = one(byName.get("provider-before-consumer") as CaseResult);
	expect(providerFirst.status === "resolved" && providerFirst.offerCountAtEmitReturn === 1, "Provider-first load order did not resolve exactly one synchronous offer.");
	pass("Provider before consumer", "Discovery at command invocation was independent of package load order.");

	const zero = one(byName.get("zero-provider") as CaseResult);
	expect(zero.status === "rejected" && zero.reason === "zero-provider", "Zero-provider outcome was not typed.");
	pass("Zero provider", "Rejected before resolution with reason zero-provider.");

	const duplicate = one(byName.get("duplicate-provider") as CaseResult);
	expect(duplicate.status === "rejected" && duplicate.reason === "duplicate-provider" && duplicate.validOfferCount === 2, "Duplicate-provider outcome was not typed.");
	pass("Duplicate providers", "Two valid offers were rejected atomically as duplicate-provider.");

	const malformed = one(byName.get("malformed-provider") as CaseResult);
	expect(malformed.status === "rejected" && malformed.reason === "malformed-provider", "Malformed-provider outcome was not typed.");
	pass("Malformed provider", "An offer without a resolver was rejected as malformed-provider.");

	const failing = one(byName.get("failing-provider") as CaseResult);
	expect(failing.status === "rejected" && failing.reason === "provider-resolution-failed", "Provider failure was not normalized.");
	pass("Provider failure", "A resolver exception became provider-resolution-failed without a fallback.");

	const cancelled = one(byName.get("cancelled-resolution") as CaseResult);
	expect(cancelled.status === "rejected" && cancelled.reason === "aborted", "Cancellation was not normalized.");
	pass("Cancellation", "The shared AbortSignal cancelled resolution and returned aborted.");

	const sdk = one(byName.get("sdk-context-adaptation") as CaseResult);
	const sdkContext = sdk.sdkContext as Record<string, unknown> | undefined;
	expect(sdk.status === "resolved" && sdkContext?.ownsModelRuntime === true && sdkContext.ownsSettingsManager === true && sdkContext.ownsResourceLoader === true, "SDK service adaptation did not produce the required owned aggregate.");
	expect(typeof sdkContext.model === "string" && (sdkContext.model as string).includes("/"), "SDK adaptation did not resolve an explicit host model.");
	pass("SDK context adaptation", `createAgentSessionServices() supplied owned services; host policy resolved ${sdkContext.model as string} explicitly.`);

	const reload = byName.get("reload-and-cleanup") as CaseResult;
	expect(reload.results.length === 2, `Reload case expected two probes, got ${reload.results.length}.`);
	const [held, afterReload] = reload.results;
	expect(held.status === "held" && held.disposeCount === 0, "Reload case did not hold a live lease.");
	expect(afterReload.status === "resolved" && afterReload.offerCountAtEmitReturn === 1, "Post-reload discovery did not return exactly one current offer.");
	const heldProvider = held.provider as Record<string, unknown>;
	const reloadedProvider = afterReload.provider as Record<string, unknown>;
	expect(heldProvider.instanceId !== reloadedProvider.instanceId, "Reload did not instantiate a fresh provider extension.");
	const oldShutdown = reload.lifecycle.find((entry) => entry.event === "provider-shutdown" && entry.instanceId === heldProvider.instanceId && entry.reason === "reload");
	const oldLeaseDisposed = reload.lifecycle.find((entry) => entry.event === "lease-disposed" && entry.instanceId === heldProvider.instanceId && entry.leaseId === held.leaseId && entry.disposeCount === 1);
	expect(oldShutdown?.activeLeaseCount === 1 && oldLeaseDisposed, "Reload did not dispose the old runtime's held lease exactly once.");
	pass("Reload and cleanup", "Reload removed stale subscriptions, created a fresh provider instance, and disposed the old held lease once.");

	return evidence;
}

function scrub(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(scrub);
	if (!value || typeof value !== "object") return value;
	const copy: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		copy[key] = key === "agentDir" ? "<host-agent-dir>" : scrub(item);
	}
	return copy;
}

async function main(): Promise<void> {
	const cases = await Promise.all([
		runRpcCase("consumer-before-provider", [packages.consumer, packages.providerA], ["/host-profile-probe normal"]),
		runRpcCase("provider-before-consumer", [packages.providerA, packages.consumer], ["/host-profile-probe normal"]),
		runRpcCase("zero-provider", [packages.consumer], ["/host-profile-probe normal"]),
		runRpcCase("duplicate-provider", [packages.consumer, packages.providerA, packages.providerB], ["/host-profile-probe normal"]),
		runRpcCase("malformed-provider", [packages.consumer, packages.malformed], ["/host-profile-probe normal"]),
		runRpcCase("failing-provider", [packages.consumer, packages.failing], ["/host-profile-probe normal"]),
		runRpcCase("cancelled-resolution", [packages.consumer, packages.providerA], ["/host-profile-probe cancel"]),
		runRpcCase("sdk-context-adaptation", [packages.consumer, packages.providerA], ["/host-profile-probe sdk"]),
		runRpcCase("reload-and-cleanup", [packages.consumer, packages.providerA], [
			"/host-profile-probe hold",
			"/host-profile-reload",
			"/host-profile-probe normal",
		]),
	]);

	const verification = verify(cases);
	const version = Bun.spawnSync(["pi", "--version"]).stdout.toString().trim();
	const markdown = [
		"# Issue 75 prototype results",
		"",
		`Generated against Pi \`${version}\` by \`bun run run.ts\`.`, 
		"",
		"## Verdict",
		"",
		"The prototype supports the proposed package-loaded Host Profile Seam on the current Pi runtime. The request/offer collection and function-bearing payload behavior depend on the current synchronous EventEmitter-backed Implementation and therefore need a Matt-owned protocol, explicit validation, and regression coverage rather than being treated as a documented Pi guarantee.",
		"",
		"| Probe | Result | Evidence |",
		"|---|---|---|",
		...verification.map((item) => `| ${item.name} | ${item.verdict} | ${item.evidence} |`),
		"",
		"## Design consequences",
		"",
		"- Discover at command invocation, after all package factories have loaded; do not announce at factory time.",
		"- Use a versioned request containing a callback and collect offers only during the synchronous `emit()` call. Reject zero, duplicate, malformed, or wrong-profile offers before resolution.",
		"- Treat the registration and resolved lease as untrusted structural values. Provider identity claims need a separate source-provenance predicate in the specification.",
		"- Pass one cancellation signal through discovery and resolution. Do not substitute another provider or fall back to `ctx.newSession` after any failure.",
		"- Make lease disposal idempotent and run it both after transaction settlement and from `session_shutdown` as a safety net.",
		"- Adapt `createAgentSessionServices()` by taking its `ModelRuntime`, `SettingsManager`, `ResourceLoader`, and `agentDir`, then resolving the model and allowed tools from explicit host policy. Do not copy Pi's private/default fallback algorithm.",
		"- Keep the Host Profile Interface transport-neutral so a later RPC Adapter can preserve the same profile, lease, cancellation, and typed-failure semantics.",
		"",
		"## Raw bounded evidence",
		"",
		"```json",
		JSON.stringify(scrub(cases.map(({ name, results, lifecycle }) => ({ name, results, lifecycle }))), null, 2),
		"```",
		"",
	].join("\n");
	await writeFile(join(root, "RESULTS.md"), markdown, "utf8");
	for (const item of verification) console.log(`${item.verdict} ${item.name}: ${item.evidence}`);
	console.log(`Wrote ${join(root, "RESULTS.md")}`);
}

await main();
