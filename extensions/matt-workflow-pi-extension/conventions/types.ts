import type { ValidationResult } from "../skill-routing/types";

export type RepoConventionsConfigV1 = {
	version: 1;
	tracker?: {
		type: "github-issues";
		labelsDocPath: string;
	};
	toolchain?: {
		runtime: string;
		commands?: {
			test?: string;
			check?: string;
			build?: string;
			aiGate?: string;
		};
	};
	docs?: {
		workflowDocPath: string;
		extraContextDocs?: string[];
	};
};

export type ConventionsContext = {
	repoRoot: string;
	configPath: string;
	configExists: boolean;
	config?: RepoConventionsConfigV1;
	validation: ValidationResult;
};
