import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Role = "user" | "assistant";

const CUSTOM_TYPE = "auto-rename-session-state";
const SESSION_NAME_STATUS_KEY = "session-name";
const CHILD_ENV = "PI_AUTO_RENAME_SESSION_CHILD";
const DEFAULT_MODEL = "openai-codex/gpt-5.4-mini";
const INTERVAL_AFTER_FIRST = 10;
const MAX_CONTEXT_CHARS = 12_000;
const CONTEXT_HEAD_RATIO = 1 / 3;
const MESSAGE_COUNT_VERSION = 2;

interface AutoRenameState {
	lastAutoName?: string;
	lastRenameCount?: number;
	messageCountVersion?: number;
	manualNamed?: boolean;
	reason?: string;
	updatedAt: number;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };

	return { command: "pi", args };
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const p = part as { type?: string; text?: string };
			if (p.type === "text" && typeof p.text === "string") return p.text;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function getUserAssistantMessages(ctx: ExtensionContext): Array<{ role: Role; text: string }> {
	const branch = ctx.sessionManager.getBranch();
	const messages: Array<{ role: Role; text: string }> = [];
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const message = (entry as any).message;
		if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
		const text = textFromContent(message.content).trim();
		if (!text) continue;
		messages.push({ role: message.role, text });
	}
	return messages;
}

function restoreState(ctx: ExtensionContext, currentName: string | undefined): AutoRenameState {
	let state: AutoRenameState = { updatedAt: Date.now() };
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && (entry as any).customType === CUSTOM_TYPE) {
			state = { ...state, ...((entry as any).data ?? {}) };
		}
	}

	if (state.messageCountVersion !== MESSAGE_COUNT_VERSION) {
		state.lastRenameCount = undefined;
		state.messageCountVersion = MESSAGE_COUNT_VERSION;
	}

	// If the current session has a name that was not the last name this extension wrote,
	// treat it as user-controlled. This covers /name, interactive rename, and sessions
	// named before this extension was installed.
	if (currentName && currentName !== state.lastAutoName) {
		state.manualNamed = true;
		state.reason = "existing-session-name";
	}

	return state;
}

function shouldRename(messageCount: number, lastRenameCount?: number): boolean {
	if (messageCount < 1) return false;
	if (messageCount !== 1 && (messageCount - 1) % INTERVAL_AFTER_FIRST !== 0) return false;
	return lastRenameCount !== messageCount;
}

function formatTranscript(messages: Array<{ role: Role; text: string }>, maxChars = MAX_CONTEXT_CHARS): string {
	const transcript = messages
		.map((m, index) => {
			const text = m.text.trim().replace(/\s+/g, " ");
			return `${index + 1}. ${m.role.toUpperCase()}: ${text}`;
		})
		.join("\n");

	if (transcript.length <= maxChars) return transcript;

	const headChars = Math.floor(maxChars * CONTEXT_HEAD_RATIO);
	const tailChars = maxChars - headChars;
	return [
		transcript.slice(0, headChars).trimEnd(),
		"...[middle transcript omitted to preserve session origin and recent context]...",
		transcript.slice(-tailChars).trimStart(),
	].join("\n");
}

function buildNamingPrompt(messages: Array<{ role: Role; text: string }>, currentName: string | undefined): string {
	const transcript = formatTranscript(messages);
	const hasCurrentName = Boolean(currentName?.trim());

	return [
		"Name this Pi coding-agent session.",
		hasCurrentName
			? "Return ONLY either UNCHANGED or a replacement title. No quotes. No explanation."
			: "Return ONLY the title. No quotes. No punctuation unless necessary.",
		"Rules:",
		"- Base the title on the whole session arc: the user's goal across the conversation",
		"- Use recent active tasks only as evidence for how the session arc has evolved",
		"- Describe what the user wants, not what the assistant is executing",
		hasCurrentName
			? "- Keep the current title only when it already captures the user goal and session arc well"
			: "- Create a title that captures the user's goal for the session",
		"- Prefer concise outcome-oriented wording; use up to 15 words when needed for context",
		"- Title Case",
		"- Use product/domain language over implementation details unless internals are the user's goal",
		"- Avoid assistant-action titles like Inspect, Analyze, Debug, Update, Implement, or Refactor unless they describe the user's requested outcome",
		"- Prefer verbs/nouns over vague labels like General Chat",
		currentName ? `Current title: ${currentName}` : "Current title: (none)",
		"",
		"Transcript:",
		transcript,
	].join("\n");
}

function sanitizeTitle(raw: string): string | undefined {
	let title = raw
		.split("\n")
		.map((line) => line.trim())
		.find(Boolean);
	if (!title) return undefined;

	title = title.replace(/^```(?:\w+)?\s*/i, "").replace(/```$/i, "").trim();
	title = title.replace(/^['\"`]+|['\"`]+$/g, "").trim();
	title = title.replace(/^(title|session name)\s*:\s*/i, "").trim();
	title = title.replace(/[.!?]+$/g, "").trim();
	title = title.replace(/\s+/g, " ");

	if (!title || /^unchanged$/i.test(title)) return undefined;
	if (title.length > 140) title = title.slice(0, 140).trim();
	return title;
}

async function generateName(prompt: string, cwd: string, signal: AbortSignal | undefined): Promise<string | undefined> {
	const args = ["--mode", "json", "--no-session", "--model", DEFAULT_MODEL, "-p", prompt];
	const invocation = getPiInvocation(args);

	return await new Promise((resolve, reject) => {
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, [CHILD_ENV]: "1" },
		});

		let stdout = "";
		let stderr = "";
		let settled = false;

		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
		};

		const abort = () => {
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
			}, 3000).unref?.();
			settle(() => resolve(undefined));
		};

		if (signal?.aborted) return abort();
		signal?.addEventListener("abort", abort, { once: true });

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		proc.on("error", (error) => settle(() => reject(error)));
		proc.on("close", (code) => {
			signal?.removeEventListener("abort", abort);
			if (settled) return;
			if (code !== 0) {
				settle(() => reject(new Error(stderr.trim() || `pi child exited with code ${code}`)));
				return;
			}

			let assistantText = "";
			for (const line of stdout.split("\n")) {
				if (!line.trim()) continue;
				try {
					const event = JSON.parse(line);
					if (event.type === "message_end" && event.message?.role === "assistant") {
						assistantText = textFromContent(event.message.content) || assistantText;
					}
				} catch {
					// Ignore non-JSON lines; fall back below.
				}
			}

			settle(() => resolve(sanitizeTitle(assistantText || stdout)));
		});
	});
}

function isStaleExtensionContextError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("This extension ctx is stale after session replacement or reload");
}

function setStatusIfActive(ctx: ExtensionContext, key: string, value: string | undefined): void {
	try {
		if (ctx.hasUI) ctx.ui.setStatus(key, value);
	} catch (error) {
		if (!isStaleExtensionContextError(error)) throw error;
	}
}

function notifyIfActive(ctx: ExtensionContext, message: string, level: "info" | "warning"): void {
	try {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	} catch (error) {
		if (!isStaleExtensionContextError(error)) throw error;
	}
}

function publishSessionNameStatus(pi: ExtensionAPI, ctx: ExtensionContext): void {
	setStatusIfActive(ctx, SESSION_NAME_STATUS_KEY, pi.getSessionName() ?? undefined);
}

export const __testing = { buildNamingPrompt, formatTranscript, isStaleExtensionContextError };

export default function autoRenameSessionExtension(pi: ExtensionAPI) {
	if (process.env[CHILD_ENV] === "1") return;

	let state: AutoRenameState = { updatedAt: Date.now() };
	let running = false;
	let rerunRequested = false;

	async function maybeRename(ctx: ExtensionContext, trigger: string) {
		if (running) {
			rerunRequested = true;
			return;
		}

		running = true;
		try {
			do {
				rerunRequested = false;
				const currentName = pi.getSessionName();
				state = restoreState(ctx, currentName);

				if (state.manualNamed) return;

				const messages = getUserAssistantMessages(ctx);
				const count = messages.length;
				if (!shouldRename(count, state.lastRenameCount)) return;

				const prompt = buildNamingPrompt(messages, currentName);
				setStatusIfActive(ctx, "auto-name", "naming session…");

				const nextName = await generateName(prompt, ctx.cwd, ctx.signal);
				if (!nextName) return;

				// Re-check after the child model call; the user may have named the session meanwhile.
				const nameAfterCall = pi.getSessionName();
				state = restoreState(ctx, nameAfterCall);
				if (state.manualNamed) return;

				if (nameAfterCall !== nextName) {
					pi.setSessionName(nextName);
				}
				publishSessionNameStatus(pi, ctx);

				state = {
					lastAutoName: nextName,
					lastRenameCount: count,
					messageCountVersion: MESSAGE_COUNT_VERSION,
					manualNamed: false,
					reason: trigger,
					updatedAt: Date.now(),
				};
				pi.appendEntry(CUSTOM_TYPE, state);
				notifyIfActive(ctx, `Session named: ${nextName}`, "info");
			} while (rerunRequested);
		} catch (error) {
			if (!isStaleExtensionContextError(error)) {
				const message = error instanceof Error ? error.message : String(error);
				notifyIfActive(ctx, `Auto session naming failed: ${message}`, "warning");
			}
		} finally {
			running = false;
			setStatusIfActive(ctx, "auto-name", undefined);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		state = restoreState(ctx, pi.getSessionName());
		publishSessionNameStatus(pi, ctx);
	});

	pi.on("input", async (event, _ctx) => {
		// Built-in /name is the user taking ownership. We cannot intercept the
		// built-in command implementation, but the raw input event lets us mark it.
		if (/^\/name(?:\s|$)/.test(event.text.trim())) {
			state = { ...state, manualNamed: true, reason: "slash-name", updatedAt: Date.now() };
			pi.appendEntry(CUSTOM_TYPE, state);
			setTimeout(() => publishSessionNameStatus(pi, _ctx), 0);
		}
		return { action: "continue" };
	});

	pi.on("message_end", async (event, ctx) => {
		const role = (event.message as any)?.role;
		if (role !== "user" && role !== "assistant") return;
		publishSessionNameStatus(pi, ctx);

		// Let Pi finish appending the message before counting the current branch.
		setTimeout(() => {
			void maybeRename(ctx, `message-${role}`).catch((error) => {
				if (!isStaleExtensionContextError(error)) throw error;
			});
		}, 0);
	});

	pi.registerCommand("auto-rename-session", {
		description: "Show or reset automatic session naming state (usage: /auto-rename-session [status|reset])",
		handler: async (args, ctx) => {
			const action = args.trim() || "status";
			if (action === "reset") {
				state = { manualNamed: false, messageCountVersion: MESSAGE_COUNT_VERSION, updatedAt: Date.now(), reason: "reset" };
				pi.appendEntry(CUSTOM_TYPE, state);
				publishSessionNameStatus(pi, ctx);
				ctx.ui.notify("Auto session naming reset for this session", "info");
				return;
			}

			state = restoreState(ctx, pi.getSessionName());
			publishSessionNameStatus(pi, ctx);
			ctx.ui.notify(
				[
					`auto-name manualNamed: ${state.manualNamed ? "yes" : "no"}`,
					`session name: ${pi.getSessionName() ?? "(none)"}`,
					`last auto name: ${state.lastAutoName ?? "(none)"}`,
					`last rename count: ${state.lastRenameCount ?? "(none)"}`,
				].join("\n"),
				"info",
			);
		},
	});
}
