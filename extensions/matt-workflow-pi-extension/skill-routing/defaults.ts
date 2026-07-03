import type { AgentRole, Limits, SkillRegistryEntry, SkillRoute } from "./types";

export const DEFAULT_LIMITS: Required<Limits> = {
	workerMaxRoutedSkills: 3,
	reviewMaxRoutedSkills: 4,
};

export const BASELINE_SKILLS: Record<AgentRole, string[]> = {
	worker: ["implement", "tdd"],
	review: [],
};

export const DEFAULT_SKILLS: SkillRegistryEntry[] = [
	{
		id: "implement",
		title: "Implement",
		compatibility: ["worker"],
		safety: "allowlisted",
		resolver: { type: "extension-vendor", relativePath: "implement/SKILL.md" },
	},
	{
		id: "tdd",
		title: "TDD",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "extension-vendor", relativePath: "tdd/SKILL.md" },
	},
	{
		id: "diagnosing-bugs",
		title: "Diagnosing Bugs",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "extension-vendor", relativePath: "diagnosing-bugs/SKILL.md" },
	},
	{
		id: "codebase-design",
		title: "Codebase Design",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "extension-vendor", relativePath: "codebase-design/SKILL.md" },
	},
	{
		id: "improve-codebase-architecture",
		title: "Improve Codebase Architecture",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "extension-vendor", relativePath: "improve-codebase-architecture/SKILL.md" },
	},
	{
		id: "accessibility",
		title: "Accessibility",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "workspace", relativePath: "accessibility/SKILL.md" },
	},
	{
		id: "react-performance-guidelines",
		title: "React Performance Guidelines",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "workspace", relativePath: "react-performance-guidelines/SKILL.md" },
	},
	{
		id: "testing-philosophy",
		title: "Testing Philosophy",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "workspace", relativePath: "testing-philosophy/SKILL.md" },
	},
	{
		id: "observability",
		title: "Observability",
		compatibility: ["worker", "review"],
		safety: "allowlisted",
		resolver: { type: "workspace", relativePath: "observability/SKILL.md" },
	},
	{
		id: "security-review",
		title: "Security Review",
		compatibility: ["review"],
		safety: "review-only",
		resolver: { type: "workspace", relativePath: "security-review/SKILL.md" },
	},
];

export const DEFAULT_ROUTES: SkillRoute[] = [
	{
		id: "bug-diagnosis",
		skillIds: ["diagnosing-bugs"],
		confidence: "medium",
		rationale: "Issue describes a bug, regression, flaky behavior, or reproduction work.",
		labels: ["bug", "regression"],
		title: ["bug", "regression", "flaky"],
		body: ["bug", "regression", "flaky", "reproduce", "repro"],
	},
	{
		id: "test-focused",
		skillIds: ["tdd", "testing-philosophy"],
		confidence: "medium",
		rationale: "Issue explicitly calls out tests, coverage, or test-first work.",
		labels: ["test", "tests", "testing"],
		title: ["test", "coverage"],
		body: ["test", "tests", "coverage", "tdd"],
	},
	{
		id: "accessibility",
		skillIds: ["accessibility"],
		confidence: "medium",
		rationale: "Issue has accessibility or assistive-technology evidence.",
		labels: ["accessibility", "a11y"],
		title: ["accessibility", "a11y", "screen reader", "keyboard navigation"],
		body: ["accessibility", "a11y", "screen reader", "keyboard navigation", "aria"],
	},
	{
		id: "react-performance",
		skillIds: ["react-performance-guidelines"],
		confidence: "medium",
		rationale: "Issue describes React rendering or web performance concerns.",
		labels: ["performance"],
		title: ["performance", "web vitals", "slow", "render"],
		body: ["performance", "web vitals", "slow", "render", "rerender", "re-render"],
		paths: [".tsx", ".jsx", "react"],
	},
	{
		id: "security-review",
		skillIds: ["security-review"],
		confidence: "high",
		rationale: "Issue touches security, authentication, authorization, or permissions.",
		labels: ["security"],
		title: ["security", "auth", "permission"],
		body: ["security", "authentication", "authorization", "permission", "permissions", "secret", "token"],
	},
	{
		id: "observability",
		skillIds: ["observability"],
		confidence: "medium",
		rationale: "Issue mentions logs, metrics, tracing, telemetry, or production diagnosis.",
		labels: ["observability"],
		title: ["logging", "metrics", "tracing", "telemetry"],
		body: ["logging", "logs", "metrics", "tracing", "telemetry", "observability"],
	},
];
