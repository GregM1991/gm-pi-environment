#!/usr/bin/env bun
import { mkdtemp, rm, cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

type SourceMetadata = {
	repo: string;
	ref: string;
	path: string;
	updatedAt: string;
};

const REPO = "https://github.com/mattpocock/skills";
const SOURCE_PATH = "skills/engineering";
const EXTENSION_ROOT = path.resolve(import.meta.dir, "..");
const VENDOR_ROOT = path.join(EXTENSION_ROOT, "vendor", "mattpocock-skills");
const ENGINEERING_DEST = path.join(VENDOR_ROOT, "engineering");
const SOURCE_JSON = path.join(VENDOR_ROOT, "SOURCE.json");

const args = new Set(Bun.argv.slice(2));
const dryRun = args.has("--dry-run");

async function main() {
	const tempRoot = await mkdtemp(path.join(tmpdir(), "mattpocock-skills-"));
	const cloneDir = path.join(tempRoot, "skills");

	try {
		await $`git clone --depth 1 ${REPO} ${cloneDir}`.quiet();
		const ref = (await $`git -C ${cloneDir} rev-parse HEAD`.text()).trim();
		const sourceDir = path.join(cloneDir, SOURCE_PATH);

		if (!existsSync(sourceDir)) {
			throw new Error(`Expected upstream path not found: ${SOURCE_PATH}`);
		}

		const previous = existsSync(SOURCE_JSON) ? await readFile(SOURCE_JSON, "utf8") : "";
		const metadata: SourceMetadata = {
			repo: REPO,
			ref,
			path: SOURCE_PATH,
			updatedAt: new Date().toISOString(),
		};

		if (dryRun) {
			console.log(`Would sync ${REPO}:${SOURCE_PATH}`);
			console.log(`Upstream HEAD: ${ref}`);
			if (previous) console.log(`Previous SOURCE.json:\n${previous.trim()}`);
			return;
		}

		await mkdir(VENDOR_ROOT, { recursive: true });
		await rm(ENGINEERING_DEST, { recursive: true, force: true });
		await cp(sourceDir, ENGINEERING_DEST, { recursive: true });

		const licenseSource = path.join(cloneDir, "LICENSE");
		if (existsSync(licenseSource)) {
			await cp(licenseSource, path.join(VENDOR_ROOT, "LICENSE"));
		}

		await writeFile(SOURCE_JSON, `${JSON.stringify(metadata, null, 2)}\n`);

		console.log(`Synced Matt Pocock engineering skills from ${REPO}`);
		console.log(`Ref: ${ref}`);
		console.log(`Destination: ${ENGINEERING_DEST}`);
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
