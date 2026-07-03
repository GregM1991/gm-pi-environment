#!/usr/bin/env bun
import { mkdtemp, rm, cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

type SourceMetadata = {
	repo: string;
	ref: string;
	paths: string[];
	updatedAt: string;
};

const REPO = "https://github.com/mattpocock/skills";
// All upstream categories except deprecated. Local copies of these skills do
// not belong in the environment's skills/ directory; vendor is canonical.
const CATEGORIES = ["engineering", "productivity", "misc", "personal", "in-progress"];
const EXTENSION_ROOT = path.resolve(import.meta.dir, "..");
const VENDOR_ROOT = path.join(EXTENSION_ROOT, "vendor", "mattpocock-skills");
const SOURCE_JSON = path.join(VENDOR_ROOT, "SOURCE.json");

const args = new Set(Bun.argv.slice(2));
const dryRun = args.has("--dry-run");

async function main() {
	const tempRoot = await mkdtemp(path.join(tmpdir(), "mattpocock-skills-"));
	const cloneDir = path.join(tempRoot, "skills");

	try {
		await $`git clone --depth 1 ${REPO} ${cloneDir}`.quiet();
		const ref = (await $`git -C ${cloneDir} rev-parse HEAD`.text()).trim();

		const sourcePaths = CATEGORIES.map((category) => `skills/${category}`);
		const missing = sourcePaths.filter((sourcePath) => !existsSync(path.join(cloneDir, sourcePath)));
		if (missing.length > 0) {
			throw new Error(`Expected upstream path(s) not found: ${missing.join(", ")}`);
		}

		const previous = existsSync(SOURCE_JSON) ? await readFile(SOURCE_JSON, "utf8") : "";
		const metadata: SourceMetadata = {
			repo: REPO,
			ref,
			paths: sourcePaths,
			updatedAt: new Date().toISOString(),
		};

		if (dryRun) {
			console.log(`Would sync ${REPO}: ${sourcePaths.join(", ")}`);
			console.log(`Upstream HEAD: ${ref}`);
			if (previous) console.log(`Previous SOURCE.json:\n${previous.trim()}`);
			return;
		}

		await mkdir(VENDOR_ROOT, { recursive: true });
		for (const category of CATEGORIES) {
			const dest = path.join(VENDOR_ROOT, category);
			await rm(dest, { recursive: true, force: true });
			await cp(path.join(cloneDir, "skills", category), dest, { recursive: true });
		}

		const licenseSource = path.join(cloneDir, "LICENSE");
		if (existsSync(licenseSource)) {
			await cp(licenseSource, path.join(VENDOR_ROOT, "LICENSE"));
		}

		await writeFile(SOURCE_JSON, `${JSON.stringify(metadata, null, 2)}\n`);

		console.log(`Synced Matt Pocock skills from ${REPO}`);
		console.log(`Ref: ${ref}`);
		console.log(`Categories: ${CATEGORIES.join(", ")}`);
		console.log(`Destination: ${VENDOR_ROOT}`);
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
