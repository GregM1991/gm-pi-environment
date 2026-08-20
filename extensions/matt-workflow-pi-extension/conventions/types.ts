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

export type BranchScopedContextDoc = {
	path: string;
	useWhen: string;
};

export type RepoConventionsDocsV3 = {
	workflowDocPath: string;
	extraContextDocs?: BranchScopedContextDoc[];
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

export type RepoConventionsConfigV3 = {
	version: 3;
	tracker?: RepoConventionsConfigV2["tracker"];
	toolchain?: RepoConventionsToolchain;
	docs?: RepoConventionsDocsV3;
	architecture?: RepoConventionsConfigV2["architecture"];
};

export type RepoConventionsConfig = RepoConventionsConfigV1 | RepoConventionsConfigV2 | RepoConventionsConfigV3;

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
