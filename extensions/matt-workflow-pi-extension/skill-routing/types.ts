export type AgentRole = "worker" | "review";
export type Confidence = "low" | "medium" | "high";
export type SkillSource = "extension-vendor" | "workspace" | "repo";

export type SkillResolver =
	| { type: "extension-vendor"; relativePath: string }
	| { type: "workspace"; relativePath: string }
	| { type: "repo"; relativePath: string };

export type SkillRegistryEntry = {
	id: string;
	title?: string;
	compatibility: AgentRole[];
	safety: "allowlisted" | "review-only";
	resolver: SkillResolver;
};

export type SkillRoute = {
	id: string;
	enabled?: boolean;
	skillIds: string[];
	confidence?: Confidence;
	rationale: string;
	labels?: string[];
	title?: string[];
	body?: string[];
	paths?: string[];
};

export type Limits = {
	workerMaxRoutedSkills?: number;
	reviewMaxRoutedSkills?: number;
};

export type SkillRouteConfigV1 = {
	version: 1;
	limits?: Limits;
	skills?: SkillRegistryEntry[];
	routes?: SkillRoute[];
	disabledRoutes?: string[];
	disabledSkills?: string[];
};

export type IssueEvidence = {
	number?: number;
	url?: string;
	title: string;
	body: string;
	labels: string[];
	paths?: string[];
};

export type DiagnosticSeverity = "error" | "warning";

export type ValidationDiagnostic = {
	severity: DiagnosticSeverity;
	code: string;
	message: string;
	path?: string;
};

export type ValidationResult = {
	ok: boolean;
	diagnostics: ValidationDiagnostic[];
};

export type ResolvedSkill = SkillRegistryEntry & {
	absolutePath: string;
	available: boolean;
};

export type RoutingContext = {
	repoRoot: string;
	extensionRoot: string;
	configPath: string;
	configExists: boolean;
	limits: Required<Limits>;
	skills: ResolvedSkill[];
	routes: Array<SkillRoute & { disabled: boolean; order: number }>;
	disabledSkills: string[];
	disabledRoutes: string[];
	validation: ValidationResult;
};

export type SkillSelection = {
	skillId: string;
	absolutePath: string;
	confidence: Confidence;
	baseline: boolean;
	routeIds: string[];
	evidence: string[];
	rationale: string[];
	available: boolean;
	order: number;
};

export type SkippedSkill = {
	skillId?: string;
	routeId?: string;
	reason: string;
	evidence?: string[];
	confidence?: Confidence;
};

export type SkillPack = {
	role: AgentRole;
	baseline: SkillSelection[];
	routed: SkillSelection[];
	skipped: SkippedSkill[];
	overflowHighConfidence: boolean;
};

export type ConsideredRoute = {
	routeId: string;
	matched: boolean;
	disabled: boolean;
	skillIds: string[];
	confidence: Confidence;
	evidence: string[];
	rationale: string;
};

export type RouteResult = {
	issue: IssueEvidence;
	worker: SkillPack;
	review: SkillPack;
	considered: ConsideredRoute[];
	validation: ValidationResult;
	configPath: string;
	limits: Required<Limits>;
};
