import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	HOST_PROFILE_PROTOCOL,
	HOST_PROFILE_REQUEST_CHANNEL,
	HOST_PROFILE_VERSION,
	type HostProfileDiscoveryRequest,
	type HostProfileRegistration,
	type PrototypeScenario,
} from "./protocol";

function plainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRegistration(value: unknown, requestId: string, profileId: string): value is HostProfileRegistration {
	if (!plainObject(value)) return false;
	if (value.protocol !== HOST_PROFILE_PROTOCOL || value.version !== HOST_PROFILE_VERSION) return false;
	if (value.requestId !== requestId || value.profileId !== profileId) return false;
	if (!plainObject(value.provider)) return false;
	return typeof value.provider.id === "string"
		&& typeof value.provider.instanceId === "string"
		&& typeof value.provider.packageId === "string"
		&& typeof value.resolve === "function";
}

async function writeResult(result: Record<string, unknown>): Promise<void> {
	const path = process.env.PROTOTYPE_RESULT_FILE;
	if (!path) throw new Error("PROTOTYPE_RESULT_FILE is required.");
	await appendFile(path, `${JSON.stringify({ at: new Date().toISOString(), ...result })}\n`, "utf8");
}

function scenarioFromArgs(args: string): PrototypeScenario {
	const scenario = args.trim() || "normal";
	if (scenario === "normal" || scenario === "hold" || scenario === "cancel" || scenario === "sdk") return scenario;
	throw new Error(`Unknown prototype scenario '${scenario}'.`);
}

export default function prototypeConsumer(pi: ExtensionAPI): void {
	const consumerInstanceId = randomUUID();

	pi.registerCommand("host-profile-probe", {
		description: "Run one Issue Transaction Host Profile discovery probe",
		handler: async (args, ctx) => {
			const scenario = scenarioFromArgs(args);
			const requestId = randomUUID();
			const profileId = process.env.PROTOTYPE_EXPECTED_PROFILE ?? "gm.issue-transaction.default";
			const controller = new AbortController();
			const offers: unknown[] = [];
			const request: HostProfileDiscoveryRequest = {
				protocol: HOST_PROFILE_PROTOCOL,
				version: HOST_PROFILE_VERSION,
				requestId,
				profileId,
				target: {
					cwd: ctx.cwd,
					owner: "GregM1991",
					repository: "gm-pi-environment",
					issue: 50,
				},
				scenario,
				signal: controller.signal,
				offer: (registration) => offers.push(registration),
			};

			// The current v0.84.2 EventEmitter-backed bus invokes listeners synchronously.
			// This prototype records whether all offers are visible when emit() returns.
			pi.events.emit(HOST_PROFILE_REQUEST_CHANNEL, request);
			const valid = offers.filter((offer) => validRegistration(offer, requestId, profileId));
			const malformedCount = offers.length - valid.length;
			const base = {
				consumerInstanceId,
				requestId,
				profileId,
				scenario,
				offerCountAtEmitReturn: offers.length,
				validOfferCount: valid.length,
				malformedOfferCount: malformedCount,
			};

			if (malformedCount > 0) {
				await writeResult({ ...base, status: "rejected", reason: "malformed-provider" });
				return;
			}
			if (valid.length === 0) {
				await writeResult({ ...base, status: "rejected", reason: "zero-provider" });
				return;
			}
			if (valid.length > 1) {
				await writeResult({
					...base,
					status: "rejected",
					reason: "duplicate-provider",
					providers: valid.map((offer) => offer.provider.id),
				});
				return;
			}

			if (scenario === "cancel") setTimeout(() => controller.abort(), 10);
			try {
				const registration = valid[0];
				const lease = await registration.resolve({ target: request.target, scenario, signal: controller.signal });
				const ping = lease.profile.ping();
				if (scenario !== "hold") {
					await lease.dispose();
					await lease.dispose();
				}
				await writeResult({
					...base,
					status: scenario === "hold" ? "held" : "resolved",
					provider: registration.provider,
					leaseId: lease.id,
					ping,
					disposeCount: lease.getDisposeCount(),
					sdkContext: lease.profile.sdkContext,
				});
			} catch (error) {
				const aborted = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
				await writeResult({
					...base,
					status: "rejected",
					reason: aborted ? "aborted" : "provider-resolution-failed",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		},
	});

	pi.registerCommand("host-profile-reload", {
		description: "Reload the prototype extension runtime",
		handler: async (_args, ctx) => {
			await ctx.reload();
			return;
		},
	});
}
