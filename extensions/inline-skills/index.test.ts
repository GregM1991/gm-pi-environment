import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import inlineSkillsExtension from "./index";

function createAutocompleteProvider(skillNames: string[]): AutocompleteProvider {
	let sessionStartHandler: ((event: unknown, ctx: unknown) => void) | undefined;
	let provider: AutocompleteProvider | undefined;

	const pi = {
		on(event: string, handler: (event: unknown, ctx: unknown) => void) {
			if (event === "session_start") sessionStartHandler = handler;
		},
		getCommands() {
			return skillNames.map((name) => ({
				name: `skill:${name}`,
				source: "skill",
				description: `${name} description`,
			}));
		},
	};

	inlineSkillsExtension(pi as unknown as ExtensionAPI);

	const current: AutocompleteProvider = {
		async getSuggestions() {
			return null;
		},
		applyCompletion(lines, cursorLine, cursorCol) {
			return { lines, cursorLine, cursorCol };
		},
	};

	sessionStartHandler?.({}, {
		ui: {
			addAutocompleteProvider(factory: (current: AutocompleteProvider) => AutocompleteProvider) {
				provider = factory(current);
			},
		},
	});

	if (!provider) throw new Error("inline-skills did not register an autocomplete provider");
	return provider;
}

describe("inline skill autocomplete", () => {
	test("shows writing-style when the user types #style", async () => {
		const provider = createAutocompleteProvider(["testing-philosophy", "writing-style", "accessibility"]);

		const suggestions = await provider.getSuggestions(["#style"], 0, 6, {
			signal: new AbortController().signal,
		});

		expect(suggestions?.items.map((item) => item.label)).toEqual(["#writing-style"]);
	});
});
