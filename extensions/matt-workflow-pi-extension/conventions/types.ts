import type { ValidationResult } from "../skill-routing/types";

export type RepoConventionsTrackerV1 = {
	type: "github-issues";
	labelsDocPath: string;
};

export type RepoConventionsToolchain = {
	runtime: string;
	commands?: {
		test?: string;
		check?: string;
		build?: string;
		aiGate?: string;
	};
};

export type RepoConventionsDocs = {
	workflowDocPath: string;
	extraContextDocs?: string[];
};

export type RepoConventionsConfigV1 = {
	version: 1;
	tracker?: RepoConventionsTrackerV1;
	toolchain?: RepoConventionsToolchain;
	docs?: RepoConventionsDocs;
};

export type RepoConventionsConfigV2 = {
	version: 2;
	tracker?: RepoConventionsTrackerV1 & {
		requiredChecks: string[];
	};
	toolchain?: RepoConventionsToolchain;
	docs?: RepoConventionsDocs;
	architecture?: {
		recapPrimitivesPath: string;
	};
};

export type RepoConventionsConfig = RepoConventionsConfigV1 | RepoConventionsConfigV2;

export type RequiredCheckPolicy =
	| { status: "resolved"; source: "github" | "configured"; requiredChecks: string[] }
	| { status: "hard-stop"; reason: "missing-required-check-policy"; message: string };

export type ConventionsContext = {
	repoRoot: string;
	configPath: string;
	configExists: boolean;
	config?: RepoConventionsConfig;
	validation: ValidationResult;
};
