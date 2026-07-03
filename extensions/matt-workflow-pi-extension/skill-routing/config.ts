import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BASELINE_SKILLS, DEFAULT_LIMITS, DEFAULT_ROUTES, DEFAULT_SKILLS } from "./defaults";
import type {
	AgentRole,
	Confidence,
	Limits,
	ResolvedSkill,
	RoutingContext,
	SkillRegistryEntry,
	SkillResolver,
	SkillRoute,
	SkillRouteConfigV1,
	ValidationDiagnostic,
	ValidationResult,
} from "./types";

const TOP_LEVEL_KEYS = new Set(["version", "limits", "skills", "routes", "disabledRoutes", "disabledSkills"]);
const ROUTE_KEYS = new Set(["id", "enabled", "skillIds", "confidence", "rationale", "labels", "title", "body", "paths"]);
const SKILL_KEYS = new Set(["id", "title", "compatibility", "safety", "resolver"]);
const RESOLVER_KEYS = new Set(["type", "relativePath"]);
const ROLES: AgentRole[] = ["worker", "review"];
const CONFIDENCE: Confidence[] = ["low", "medium", "high"];

const diagnostic = (code: string, message: string, pathName?: string): ValidationDiagnostic => ({
	severity: "error",
	code,
	message,
	path: pathName,
});

export function configPathFor(repoRoot: string): string {
	return path.join(repoRoot, ".pi", "matt-skill-routes.json");
}

export function scaffoldSkillRoutesJson(): string {
	return `${JSON.stringify(
		{
			version: 1,
			limits: DEFAULT_LIMITS,
			skills: [],
			routes: [],
			disabledRoutes: [],
			disabledSkills: [],
		},
		null,
		2,
	)}\n`;
}

export function scaffoldSkillRoutes(repoRoot: string): { created: boolean; path: string; message: string } {
	const target = configPathFor(repoRoot);
	if (existsSync(target)) {
		return { created: false, path: target, message: `Skill route config already exists: ${target}` };
	}

	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, scaffoldSkillRoutesJson(), "utf8");
	return { created: true, path: target, message: `Created skill route config: ${target}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function nonEmptyStringArray(value: unknown): value is string[] {
	return stringArray(value) && value.length > 0;
}

function uniqueDiagnostics(values: string[], label: string, pathName: string): ValidationDiagnostic[] {
	const seen = new Set<string>();
	const errors: ValidationDiagnostic[] = [];
	for (const value of values) {
		if (seen.has(value)) errors.push(diagnostic("duplicate-id", `Duplicate ${label} '${value}'.`, pathName));
		seen.add(value);
	}
	return errors;
}

function validateLimits(limits: unknown, errors: ValidationDiagnostic[]): Limits | undefined {
	if (limits === undefined) return undefined;
	if (!isRecord(limits)) {
		errors.push(diagnostic("invalid-limits", "limits must be an object.", "limits"));
		return undefined;
	}

	const parsed: Limits = {};
	for (const key of Object.keys(limits)) {
		if (key !== "workerMaxRoutedSkills" && key !== "reviewMaxRoutedSkills") {
			errors.push(diagnostic("unknown-limit", `Unknown limits field '${key}'.`, `limits.${key}`));
			continue;
		}
		const value = limits[key];
		if (!Number.isInteger(value) || Number(value) <= 0) {
			errors.push(diagnostic("invalid-limit", `${key} must be a positive integer.`, `limits.${key}`));
			continue;
		}
		parsed[key] = value as number;
	}
	return parsed;
}

function validateResolver(value: unknown, errors: ValidationDiagnostic[], pathName: string): SkillResolver | undefined {
	if (!isRecord(value)) {
		errors.push(diagnostic("invalid-resolver", "resolver must be an object.", pathName));
		return undefined;
	}
	for (const key of Object.keys(value)) {
		if (!RESOLVER_KEYS.has(key)) errors.push(diagnostic("unknown-resolver-field", `Unknown resolver field '${key}'.`, `${pathName}.${key}`));
	}
	if (value.type !== "extension-vendor" && value.type !== "workspace" && value.type !== "repo") {
		errors.push(diagnostic("invalid-resolver-type", "resolver.type must be extension-vendor, workspace, or repo.", `${pathName}.type`));
		return undefined;
	}
	if (typeof value.relativePath !== "string" || value.relativePath.trim().length === 0) {
		errors.push(diagnostic("invalid-resolver-path", "resolver.relativePath must be a non-empty string.", `${pathName}.relativePath`));
		return undefined;
	}
	return { type: value.type, relativePath: value.relativePath } as SkillResolver;
}

function validateRepoResolver(resolver: SkillResolver, repoRoot: string, errors: ValidationDiagnostic[], pathName: string): void {
	if (resolver.type !== "repo") return;
	const relativePath = resolver.relativePath;
	if (path.isAbsolute(relativePath) || /^[a-z]+:\/\//i.test(relativePath)) {
		errors.push(diagnostic("invalid-repo-skill-path", "Repo skill resolver paths must be repo-relative local paths, not absolute paths or URLs.", pathName));
	}
	if (!relativePath.endsWith("SKILL.md")) {
		errors.push(diagnostic("invalid-repo-skill-path", "Repo skill resolver paths must point to a SKILL.md file.", pathName));
	}
	const resolved = path.resolve(repoRoot, relativePath);
	const relative = path.relative(repoRoot, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		errors.push(diagnostic("invalid-repo-skill-path", "Repo skill resolver paths must stay inside the repo root.", pathName));
	}
}

function validateSkills(value: unknown, repoRoot: string, errors: ValidationDiagnostic[]): SkillRegistryEntry[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		errors.push(diagnostic("invalid-skills", "skills must be an array.", "skills"));
		return [];
	}
	const skills: SkillRegistryEntry[] = [];
	value.forEach((item, index) => {
		const pathName = `skills[${index}]`;
		if (!isRecord(item)) {
			errors.push(diagnostic("invalid-skill", "skill entries must be objects.", pathName));
			return;
		}
		for (const key of Object.keys(item)) {
			if (!SKILL_KEYS.has(key)) errors.push(diagnostic("unknown-skill-field", `Unknown skill field '${key}'.`, `${pathName}.${key}`));
		}
		if (typeof item.id !== "string" || item.id.trim().length === 0) errors.push(diagnostic("invalid-skill-id", "skill.id must be a non-empty string.", `${pathName}.id`));
		if (item.title !== undefined && typeof item.title !== "string") errors.push(diagnostic("invalid-skill-title", "skill.title must be a string when present.", `${pathName}.title`));
		if (!stringArray(item.compatibility) || !item.compatibility.every((role) => ROLES.includes(role as AgentRole))) {
			errors.push(diagnostic("invalid-compatibility", "skill.compatibility must list worker and/or review; no 'both' shortcut is supported.", `${pathName}.compatibility`));
		}
		if (item.safety !== "allowlisted" && item.safety !== "review-only") errors.push(diagnostic("invalid-safety", "skill.safety must be allowlisted or review-only.", `${pathName}.safety`));
		const resolver = validateResolver(item.resolver, errors, `${pathName}.resolver`);
		if (resolver?.type !== "repo") {
			errors.push(diagnostic("invalid-repo-skill-resolver", "Repo config skills must use resolver.type 'repo' with a repo-relative SKILL.md path.", `${pathName}.resolver.type`));
		}
		if (resolver) validateRepoResolver(resolver, repoRoot, errors, `${pathName}.resolver.relativePath`);
		if (typeof item.id === "string" && stringArray(item.compatibility) && resolver && (item.safety === "allowlisted" || item.safety === "review-only")) {
			skills.push({
				id: item.id,
				title: typeof item.title === "string" ? item.title : undefined,
				compatibility: item.compatibility as AgentRole[],
				safety: item.safety,
				resolver,
			});
		}
	});
	return skills;
}

function validateRoutes(value: unknown, errors: ValidationDiagnostic[]): SkillRoute[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		errors.push(diagnostic("invalid-routes", "routes must be an array.", "routes"));
		return [];
	}
	const routes: SkillRoute[] = [];
	value.forEach((item, index) => {
		const pathName = `routes[${index}]`;
		if (!isRecord(item)) {
			errors.push(diagnostic("invalid-route", "route entries must be objects.", pathName));
			return;
		}
		for (const key of Object.keys(item)) {
			if (!ROUTE_KEYS.has(key)) errors.push(diagnostic("unknown-route-field", `Unknown route field '${key}'.`, `${pathName}.${key}`));
		}
		if (typeof item.id !== "string" || item.id.trim().length === 0) errors.push(diagnostic("invalid-route-id", "route.id must be a non-empty string.", `${pathName}.id`));
		if (item.enabled !== undefined && typeof item.enabled !== "boolean") errors.push(diagnostic("invalid-route-enabled", "route.enabled must be boolean when present.", `${pathName}.enabled`));
		if (!nonEmptyStringArray(item.skillIds)) errors.push(diagnostic("invalid-route-skills", "route.skillIds must be a non-empty string array.", `${pathName}.skillIds`));
		if (item.confidence !== undefined && !CONFIDENCE.includes(item.confidence as Confidence)) errors.push(diagnostic("invalid-confidence", "route.confidence must be low, medium, or high.", `${pathName}.confidence`));
		if (typeof item.rationale !== "string" || item.rationale.trim().length === 0) errors.push(diagnostic("invalid-rationale", "route.rationale must be a non-empty string.", `${pathName}.rationale`));
		const labels = item.labels === undefined ? undefined : nonEmptyStringArray(item.labels) ? item.labels : undefined;
		const title = item.title === undefined ? undefined : nonEmptyStringArray(item.title) ? item.title : undefined;
		const body = item.body === undefined ? undefined : nonEmptyStringArray(item.body) ? item.body : undefined;
		const paths = item.paths === undefined ? undefined : nonEmptyStringArray(item.paths) ? item.paths : undefined;
		if (item.labels !== undefined && labels === undefined) errors.push(diagnostic("invalid-route-match", "route.labels must be a non-empty string array.", `${pathName}.labels`));
		if (item.title !== undefined && title === undefined) errors.push(diagnostic("invalid-route-match", "route.title must be a non-empty string array.", `${pathName}.title`));
		if (item.body !== undefined && body === undefined) errors.push(diagnostic("invalid-route-match", "route.body must be a non-empty string array.", `${pathName}.body`));
		if (item.paths !== undefined && paths === undefined) errors.push(diagnostic("invalid-route-match", "route.paths must be a non-empty string array.", `${pathName}.paths`));
		if (!labels && !title && !body && !paths) errors.push(diagnostic("missing-route-match", "route must include at least one of labels, title, body, or paths.", pathName));
		if (typeof item.id === "string" && nonEmptyStringArray(item.skillIds) && typeof item.rationale === "string") {
			routes.push({
				id: item.id,
				enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
				skillIds: item.skillIds,
				confidence: item.confidence as Confidence | undefined,
				rationale: item.rationale,
				labels,
				title,
				body,
				paths,
			});
		}
	});
	return routes;
}

function parseRepoConfig(repoRoot: string, configPath: string): { config?: SkillRouteConfigV1; diagnostics: ValidationDiagnostic[]; exists: boolean } {
	if (!existsSync(configPath)) return { diagnostics: [], exists: false };
	const diagnostics: ValidationDiagnostic[] = [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (error) {
		return { diagnostics: [diagnostic("invalid-json", `Invalid strict JSON in ${configPath}: ${error instanceof Error ? error.message : String(error)}`)], exists: true };
	}
	if (!isRecord(parsed)) return { diagnostics: [diagnostic("invalid-config", "Skill route config must be a JSON object.")], exists: true };
	for (const key of Object.keys(parsed)) {
		if (!TOP_LEVEL_KEYS.has(key)) diagnostics.push(diagnostic("unknown-config-field", `Unknown top-level config field '${key}'.`, key));
	}
	if (parsed.version !== 1) diagnostics.push(diagnostic("invalid-version", "Skill route config requires version: 1.", "version"));
	const limits = validateLimits(parsed.limits, diagnostics);
	const skills = validateSkills(parsed.skills, repoRoot, diagnostics);
	const routes = validateRoutes(parsed.routes, diagnostics);
	const disabledRoutes = parsed.disabledRoutes === undefined ? [] : stringArray(parsed.disabledRoutes) ? parsed.disabledRoutes : [];
	const disabledSkills = parsed.disabledSkills === undefined ? [] : stringArray(parsed.disabledSkills) ? parsed.disabledSkills : [];
	if (parsed.disabledRoutes !== undefined && !stringArray(parsed.disabledRoutes)) diagnostics.push(diagnostic("invalid-disabled-routes", "disabledRoutes must be a string array.", "disabledRoutes"));
	if (parsed.disabledSkills !== undefined && !stringArray(parsed.disabledSkills)) diagnostics.push(diagnostic("invalid-disabled-skills", "disabledSkills must be a string array.", "disabledSkills"));
	return {
		config: { version: 1, limits, skills, routes, disabledRoutes, disabledSkills },
		diagnostics,
		exists: true,
	};
}

function resolveSkill(entry: SkillRegistryEntry, repoRoot: string, extensionRoot: string): ResolvedSkill {
	let absolutePath: string;
	if (entry.resolver.type === "extension-vendor") {
		absolutePath = path.join(extensionRoot, "vendor", "mattpocock-skills", "engineering", entry.resolver.relativePath);
	} else if (entry.resolver.type === "workspace") {
		absolutePath = path.resolve(extensionRoot, "..", "..", "skills", entry.resolver.relativePath);
	} else {
		absolutePath = path.resolve(repoRoot, entry.resolver.relativePath);
	}
	return { ...entry, absolutePath, available: existsSync(absolutePath) };
}

export function buildRoutingContext(repoRoot: string, extensionRoot: string): RoutingContext {
	const configPath = configPathFor(repoRoot);
	const parsed = parseRepoConfig(repoRoot, configPath);
	const diagnostics = [...parsed.diagnostics];
	const repoConfig = parsed.config;
	const limits = { ...DEFAULT_LIMITS, ...(repoConfig?.limits ?? {}) };
	const skills = [...DEFAULT_SKILLS, ...(repoConfig?.skills ?? [])];
	const routes = [...DEFAULT_ROUTES, ...(repoConfig?.routes ?? [])];
	const disabledRoutes = repoConfig?.disabledRoutes ?? [];
	const disabledSkills = repoConfig?.disabledSkills ?? [];

	diagnostics.push(...uniqueDiagnostics(skills.map((item) => item.id), "skill id", "skills"));
	diagnostics.push(...uniqueDiagnostics(routes.map((item) => item.id), "route id", "routes"));

	const skillIds = new Set(skills.map((item) => item.id));
	for (const route of routes) {
		for (const skillId of route.skillIds) {
			if (!skillIds.has(skillId)) diagnostics.push(diagnostic("unknown-route-skill", `Route '${route.id}' references unknown skill '${skillId}'.`, `routes.${route.id}.skillIds`));
		}
	}
	for (const routeId of disabledRoutes) {
		if (!routes.some((route) => route.id === routeId)) diagnostics.push(diagnostic("unknown-disabled-route", `disabledRoutes references unknown route '${routeId}'.`, "disabledRoutes"));
	}
	for (const skillId of disabledSkills) {
		if (!skillIds.has(skillId)) diagnostics.push(diagnostic("unknown-disabled-skill", `disabledSkills references unknown skill '${skillId}'.`, "disabledSkills"));
	}
	for (const [role, baselineSkillIds] of Object.entries(BASELINE_SKILLS) as Array<[AgentRole, string[]]>) {
		for (const skillId of baselineSkillIds) {
			if (!skillIds.has(skillId)) diagnostics.push(diagnostic("unknown-baseline-skill", `Baseline ${role} skill '${skillId}' is not in the skill registry.`));
		}
	}

	const resolvedSkills = skills.map((entry) => resolveSkill(entry, repoRoot, extensionRoot));
	const routedBaselineIds = new Set(Object.values(BASELINE_SKILLS).flat());
	for (const skill of resolvedSkills) {
		if (routedBaselineIds.has(skill.id) && !skill.available) {
			diagnostics.push(diagnostic("missing-baseline-skill", `Baseline skill '${skill.id}' is missing at ${skill.absolutePath}.`));
		}
	}

	const disabledRouteSet = new Set(disabledRoutes);
	return {
		repoRoot,
		extensionRoot,
		configPath,
		configExists: parsed.exists,
		limits,
		skills: resolvedSkills,
		routes: routes.map((route, order) => ({ ...route, disabled: route.enabled === false || disabledRouteSet.has(route.id), order })),
		disabledSkills,
		disabledRoutes,
		validation: { ok: diagnostics.length === 0, diagnostics },
	};
}

export function formatValidationDiagnostics(validation: ValidationResult): string {
	if (validation.ok) return "Routing config validation passed.";
	return ["Skill routing config validation failed:", ...validation.diagnostics.map((item) => `- ${item.code}${item.path ? ` (${item.path})` : ""}: ${item.message}`)].join("\n");
}
