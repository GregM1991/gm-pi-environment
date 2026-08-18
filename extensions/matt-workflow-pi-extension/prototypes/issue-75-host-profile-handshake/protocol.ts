export const HOST_PROFILE_REQUEST_CHANNEL = "matt:issue-transaction-host-profile:request";
export const HOST_PROFILE_PROTOCOL = "matt.issue-transaction-host-profile";
export const HOST_PROFILE_VERSION = 1;

export type PrototypeScenario = "normal" | "hold" | "cancel" | "sdk";

export type HostProfileTarget = {
	cwd: string;
	owner: string;
	repository: string;
	issue: number;
};

export type HostProfileDiscoveryRequest = {
	protocol: typeof HOST_PROFILE_PROTOCOL;
	version: typeof HOST_PROFILE_VERSION;
	requestId: string;
	profileId: string;
	target: HostProfileTarget;
	scenario: PrototypeScenario;
	signal: AbortSignal;
	offer(registration: unknown): void;
};

export type PrototypeSdkContextSummary = {
	id: string;
	agentDir: string;
	model: string;
	allowedTools: string[];
	diagnostics: { info: number; warning: number; error: number };
	ownsModelRuntime: true;
	ownsSettingsManager: true;
	ownsResourceLoader: true;
};

export type PrototypeHostProfile = {
	id: string;
	providerId: string;
	providerInstanceId: string;
	ping(): string;
	sdkContext?: PrototypeSdkContextSummary;
};

export type PrototypeHostProfileLease = {
	id: string;
	profile: PrototypeHostProfile;
	dispose(): Promise<void>;
	getDisposeCount(): number;
};

export type HostProfileRegistration = {
	protocol: typeof HOST_PROFILE_PROTOCOL;
	version: typeof HOST_PROFILE_VERSION;
	requestId: string;
	profileId: string;
	provider: {
		id: string;
		instanceId: string;
		packageId: string;
	};
	resolve(input: {
		target: HostProfileTarget;
		scenario: PrototypeScenario;
		signal: AbortSignal;
	}): Promise<PrototypeHostProfileLease>;
};
