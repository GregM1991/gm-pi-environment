import { describe, expect, test } from "bun:test";
import { DEFAULT_BREADCRUMB_FILENAMES, resolveGlobalBreadcrumbFilenames } from "./index";

describe("context breadcrumb global configuration", () => {
	test("uses the configured filename list", () => {
		expect(
			resolveGlobalBreadcrumbFilenames({
				"context-breadcrumbs": {
					includeFilenames: ["AGENTS.md", "AGENTS.override.md"],
				},
			}),
		).toEqual(["AGENTS.md", "AGENTS.override.md"]);
	});

	test("falls back when configuration is absent or empty", () => {
		expect(resolveGlobalBreadcrumbFilenames({})).toEqual(DEFAULT_BREADCRUMB_FILENAMES);
		expect(
			resolveGlobalBreadcrumbFilenames({
				"context-breadcrumbs": { includeFilenames: [] },
			}),
		).toEqual(DEFAULT_BREADCRUMB_FILENAMES);
	});

	test("ignores invalid filename entries", () => {
		expect(
			resolveGlobalBreadcrumbFilenames({
				"context-breadcrumbs": {
					includeFilenames: ["AGENTS.md", "", 42, "AGENTS.override.md"],
				},
			}),
		).toEqual(["AGENTS.md", "AGENTS.override.md"]);
	});
});
