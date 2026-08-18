import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import inlineSkillsExtension from "./index";

type InputResult = { action: string; text?: string };
type InputHandler = (
	event: { source: "interactive"; text: string; images?: undefined },
	ctx: { ui: { notify(): void } },
) => Promise<InputResult>;

function createInputHandler(skillNames: string[]): InputHandler {
	let inputHandler: InputHandler | undefined;
	const pi = {
		on(event: string, handler: InputHandler) {
			if (event === "input") inputHandler = handler;
		},
		getCommands() {
			return skillNames.map((name) => ({
				name: `skill:${name}`,
				source: "skill",
				description: `${name} description`,
				sourceInfo: { path: import.meta.path },
			}));
		},
	};

	inlineSkillsExtension(pi as unknown as ExtensionAPI);
	if (!inputHandler) throw new Error("inline-skills did not register an input handler");
	return inputHandler;
}

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

describe("inline skill input", () => {
	test("preserves the skill marker in the user's prose", async () => {
		const handleInput = createInputHandler(["writing-style"]);

		const result = await handleInput(
			{ source: "interactive", text: "Use #writing-style", images: undefined },
			{ ui: { notify() {} } },
		);

		expect(result).toMatchObject({
			action: "transform",
			text: "/skill:writing-style Use #writing-style",
		});
	});

	test("loads multiple skills and preserves all markers in the user's prose", async () => {
		const handleInput = createInputHandler(["writing-style", "testing-philosophy"]);
		const userText = "Use #writing-style and #testing-philosophy";

		const result = await handleInput(
			{ source: "interactive", text: userText, images: undefined },
			{ ui: { notify() {} } },
		);

		expect(result.action).toBe("transform");
		expect(result.text).toContain('<skill name="writing-style"');
		expect(result.text).toContain('<skill name="testing-philosophy"');
		expect(result.text?.endsWith(userText)).toBe(true);
	});
});

describe("inline skill autocomplete", () => {
	test("shows writing-style when the user types #style", async () => {
		const provider = createAutocompleteProvider(["testing-philosophy", "writing-style", "accessibility"]);

		const suggestions = await provider.getSuggestions(["#style"], 0, 6, {
			signal: new AbortController().signal,
		});

		expect(suggestions?.items.map((item) => item.label)).toEqual(["#writing-style"]);
	});
});
