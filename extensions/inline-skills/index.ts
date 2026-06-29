import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type SkillCommand = ReturnType<ExtensionAPI["getCommands"]>[number];

const INLINE_SKILL_PATTERN = /(?:^|\s)(@skills?:|\/skills?:)([a-z0-9][a-z0-9-]{0,63})(?=$|\s|[.,;:!?])/gi;
const INLINE_SKILL_COMPLETION_PATTERN = /(?:^|[ \t])(@skills?:|\/skills?:)([a-z0-9-]*)$/i;

function normalizeSkillName(name: string): string {
	return name.trim().toLowerCase();
}

function commandSkillName(command: SkillCommand): string | undefined {
	if (command.source !== "skill") return undefined;
	if (!command.name.startsWith("skill:")) return undefined;
	return normalizeSkillName(command.name.slice("skill:".length));
}

function resolveSkillFile(command: SkillCommand): string | undefined {
	const sourcePath = command.sourceInfo?.path;
	if (!sourcePath) return undefined;

	try {
		if (!existsSync(sourcePath)) return undefined;
		const stat = statSync(sourcePath);
		if (stat.isDirectory()) {
			const skillFile = join(sourcePath, "SKILL.md");
			return existsSync(skillFile) ? skillFile : undefined;
		}
		return sourcePath;
	} catch {
		return undefined;
	}
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
}

function readSkill(command: SkillCommand): { path: string; baseDir: string; content: string } | undefined {
	const path = resolveSkillFile(command);
	if (!path) return undefined;

	try {
		const sourcePath = command.sourceInfo?.path;
		const baseDir = sourcePath && statSync(sourcePath).isDirectory() ? sourcePath : path.replace(/\/[^/]*$/, "");
		return { path, baseDir, content: stripFrontmatter(readFileSync(path, "utf8")) };
	} catch {
		return undefined;
	}
}

function extractInlineSkillNames(text: string): string[] {
	const names = new Set<string>();
	for (const match of text.matchAll(INLINE_SKILL_PATTERN)) {
		const name = match[2];
		if (name) names.add(normalizeSkillName(name));
	}
	return [...names];
}

function stripInlineSkillMarkers(text: string): string {
	return text
		.replace(INLINE_SKILL_PATTERN, () => "")
		.replace(/\s{2,}/g, " ")
		.trim();
}

function getSkillCommands(pi: ExtensionAPI): Map<string, SkillCommand> {
	const skillCommands = new Map<string, SkillCommand>();
	for (const command of pi.getCommands()) {
		const skillName = commandSkillName(command);
		if (skillName && !skillCommands.has(skillName)) {
			skillCommands.set(skillName, command);
		}
	}
	return skillCommands;
}

export default function inlineSkillsExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const line = lines[cursorLine] ?? "";
				const beforeCursor = line.slice(0, cursorCol);
				const match = beforeCursor.match(INLINE_SKILL_COMPLETION_PATTERN);

				if (!match) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const trigger = match[1] ?? "@skill:";
				const typedName = normalizeSkillName(match[2] ?? "");
				const skillCommands = getSkillCommands(pi);
				const items = [...skillCommands.entries()]
					.filter(([name]) => name.startsWith(typedName))
					.map(([name, command]) => ({
						value: `${trigger}${name}`,
						label: `${trigger}${name}`,
						description: command.description,
					}));

				return {
					prefix: `${trigger}${match[2] ?? ""}`,
					items,
				};
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };

		const trimmed = event.text.trim();
		// Preserve Pi's native leading skill command behaviour exactly.
		if (/^\/skills?:[a-z0-9][a-z0-9-]{0,63}(?:\s|$)/i.test(trimmed)) {
			return { action: "continue" };
		}

		const requestedSkillNames = extractInlineSkillNames(event.text);
		if (requestedSkillNames.length === 0) return { action: "continue" };

		const skillCommands = getSkillCommands(pi);

		const loadedSkills: Array<{ name: string; path: string; baseDir: string; content: string }> = [];
		const missingSkills: string[] = [];

		for (const name of requestedSkillNames) {
			const command = skillCommands.get(name);
			const skill = command ? readSkill(command) : undefined;
			if (!skill) {
				missingSkills.push(name);
				continue;
			}
			loadedSkills.push({ name, path: skill.path, baseDir: skill.baseDir, content: skill.content });
		}

		if (loadedSkills.length === 0) {
			ctx.ui.notify(`No inline skills found: ${missingSkills.join(", ")}`, "warning");
			return { action: "continue" };
		}

		if (missingSkills.length > 0) {
			ctx.ui.notify(`Inline skill(s) not found: ${missingSkills.join(", ")}`, "warning");
		}

		const cleanedUserText = stripInlineSkillMarkers(event.text) || event.text;

		// For the common single-skill case, delegate to Pi's native /skill:name
		// expansion after input handlers run. This keeps inline skills byte-for-byte
		// aligned with out-of-the-box leading /skill:name behavior.
		if (loadedSkills.length === 1) {
			const transformedText = `/skill:${loadedSkills[0]!.name}${cleanedUserText ? ` ${cleanedUserText}` : ""}`;
			ctx.ui.notify(`Loaded inline skill(s): ${loadedSkills.map((skill) => skill.name).join(", ")}`, "info");
			return { action: "transform", text: transformedText, images: event.images };
		}

		// Pi only has native expansion for one leading /skill:name command. For multiple
		// inline skills, manually emit the same block shape Pi uses for each skill.
		const skillBlocks = loadedSkills
			.map(
				(skill) =>
					`<skill name="${skill.name}" location="${skill.path}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.content}\n</skill>`,
			)
			.join("\n\n");

		const transformedText = `${skillBlocks}\n\n${cleanedUserText}`;

		ctx.ui.notify(`Loaded inline skill(s): ${loadedSkills.map((skill) => skill.name).join(", ")}`, "info");
		return { action: "transform", text: transformedText, images: event.images };
	});
}
