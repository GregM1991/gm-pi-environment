import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
	createAgentSessionServices,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
	HOST_PROFILE_PROTOCOL,
	HOST_PROFILE_REQUEST_CHANNEL,
	HOST_PROFILE_VERSION,
	type HostProfileDiscoveryRequest,
	type HostProfileRegistration,
	type PrototypeHostProfileLease,
	type PrototypeSdkContextSummary,
} from "./protocol";

type ProviderMode = "good" | "malformed" | "failing";

type ProviderOptions = {
	providerId: string;
	packageId: string;
	mode: ProviderMode;
};

async function record(event: Record<string, unknown>): Promise<void> {
	const path = process.env.PROTOTYPE_LIFECYCLE_FILE;
	if (!path) return;
	await appendFile(path, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
}

function abortError(): Error {
	const error = new Error("Host Profile resolution was aborted.");
	error.name = "AbortError";
	return error;
}

async function waitForAbort(signal: AbortSignal): Promise<never> {
	if (signal.aborted) throw abortError();
	await new Promise<void>((_resolve, reject) => {
		const onAbort = () => reject(abortError());
		signal.addEventListener("abort", onAbort, { once: true });
	});
	throw abortError();
}

async function buildSdkContextSummary(profileId: string, targetCwd: string): Promise<PrototypeSdkContextSummary> {
	const agentDir = process.env.PROTOTYPE_HOST_AGENT_DIR;
	if (!agentDir) throw new Error("PROTOTYPE_HOST_AGENT_DIR is required for the SDK adaptation probe.");

	const services = await createAgentSessionServices({
		cwd: targetCwd,
		agentDir,
		modelRuntimeSignal: AbortSignal.timeout(30_000),
	});
	const provider = services.settingsManager.getDefaultProvider();
	const modelId = services.settingsManager.getDefaultModel();
	if (!provider || !modelId) throw new Error("The host has no explicit default provider/model policy.");
	const model = services.modelRuntime.getModel(provider, modelId);
	if (!model) throw new Error(`The host-approved model '${provider}/${modelId}' is unavailable.`);
	if (!services.modelRuntime.hasConfiguredAuth(provider)) {
		throw new Error(`The host-approved provider '${provider}' has no configured authentication.`);
	}

	const diagnostics = { info: 0, warning: 0, error: 0 };
	for (const diagnostic of services.diagnostics) diagnostics[diagnostic.type] += 1;

	// This is the smallest adaptation to the existing ApprovedPiSdkContext shape:
	// services supply the infrastructure aggregate; host policy resolves the explicit model and tools.
	return {
		id: profileId,
		agentDir: services.agentDir,
		model: `${model.provider}/${model.id}`,
		allowedTools: ["read", "bash", "edit", "write"],
		diagnostics,
		ownsModelRuntime: true,
		ownsSettingsManager: true,
		ownsResourceLoader: true,
	};
}

export function createPrototypeProvider(options: ProviderOptions) {
	return function prototypeProvider(pi: ExtensionAPI): void {
		const instanceId = randomUUID();
		const activeLeases = new Map<string, PrototypeHostProfileLease>();

		void record({ event: "provider-loaded", providerId: options.providerId, instanceId, mode: options.mode });

		pi.events.on(HOST_PROFILE_REQUEST_CHANNEL, (data) => {
			const request = data as Partial<HostProfileDiscoveryRequest>;
			if (
				request.protocol !== HOST_PROFILE_PROTOCOL
				|| request.version !== HOST_PROFILE_VERSION
				|| typeof request.requestId !== "string"
				|| typeof request.profileId !== "string"
				|| typeof request.offer !== "function"
			) return;

			if (options.mode === "malformed") {
				request.offer({
					protocol: HOST_PROFILE_PROTOCOL,
					version: HOST_PROFILE_VERSION,
					requestId: request.requestId,
					profileId: request.profileId,
					provider: { id: options.providerId, instanceId, packageId: options.packageId },
					// Deliberately no resolve function.
				});
				return;
			}

			const registration: HostProfileRegistration = {
				protocol: HOST_PROFILE_PROTOCOL,
				version: HOST_PROFILE_VERSION,
				requestId: request.requestId,
				profileId: request.profileId,
				provider: { id: options.providerId, instanceId, packageId: options.packageId },
				resolve: async ({ target, scenario, signal }) => {
					if (options.mode === "failing") throw new Error("Prototype provider failed before lease construction.");
					if (scenario === "cancel") await waitForAbort(signal);
					signal.throwIfAborted();

					const leaseId = randomUUID();
					let disposeCount = 0;
					const sdkContext = scenario === "sdk"
						? await buildSdkContextSummary(request.profileId as string, target.cwd)
						: undefined;
					const lease: PrototypeHostProfileLease = {
						id: leaseId,
						profile: {
							id: request.profileId as string,
							providerId: options.providerId,
							providerInstanceId: instanceId,
							ping: () => `pong:${options.providerId}:${instanceId}`,
							sdkContext,
						},
						async dispose() {
							if (disposeCount > 0) return;
							disposeCount += 1;
							activeLeases.delete(leaseId);
							await record({ event: "lease-disposed", providerId: options.providerId, instanceId, leaseId, disposeCount });
						},
						getDisposeCount: () => disposeCount,
					};
					activeLeases.set(leaseId, lease);
					await record({ event: "lease-created", providerId: options.providerId, instanceId, leaseId, scenario });
					return lease;
				},
			};
			request.offer(registration);
		});

		pi.on("session_shutdown", async (event) => {
			await record({
				event: "provider-shutdown",
				providerId: options.providerId,
				instanceId,
				reason: event.reason,
				activeLeaseCount: activeLeases.size,
			});
			await Promise.all([...activeLeases.values()].map((lease) => lease.dispose()));
		});
	};
}
