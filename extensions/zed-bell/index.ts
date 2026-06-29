import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function ringBell() {
	process.stdout.write("\x07");
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function zedBellExtension(pi: ExtensionAPI) {
	pi.on("agent_end", async () => {
		ringBell();
	});

	pi.registerCommand("zed-bell-test", {
		description: "Emit a terminal BEL after 3 seconds for testing Zed terminal thread notifications",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Emitting terminal BEL in 3 seconds", "info");
			await wait(3000);
			ringBell();
			ctx.ui.notify("Emitted terminal BEL", "info");
		},
	});
}
