#!/usr/bin/env bun
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

export type ChangeKind = "added" | "removed" | "changed";
export type TreeChange = { category: string; path: string; kind: ChangeKind };
type SourceMetadata = { repo: string; ref: string; paths: string[]; updatedAt: string };

export const REPO = "https://github.com/mattpocock/skills";
export const CATEGORIES = ["engineering", "productivity", "misc", "personal", "in-progress"] as const;
const EXTENSION_ROOT = path.resolve(import.meta.dir, "..");
const VENDOR_ROOT = path.join(EXTENSION_ROOT, "vendor", "mattpocock-skills");
const SOURCE_JSON = path.join(VENDOR_ROOT, "SOURCE.json");

async function fileMap(root: string): Promise<Map<string, Uint8Array>> {
	const result = new Map<string, Uint8Array>();
	if (!existsSync(root)) return result;
	async function visit(current: string): Promise<void> {
		for (const entry of await readdir(current, { withFileTypes: true })) {
			const absolute = path.join(current, entry.name);
			if (entry.isDirectory()) await visit(absolute);
			else if (entry.isFile()) result.set(path.relative(root, absolute), new Uint8Array(await readFile(absolute)));
		}
	}
	await visit(root);
	return result;
}

function equalBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
	if (!a || !b || a.length !== b.length) return false;
	return a.every((value, index) => value === b[index]);
}

export async function compareCategoryTrees(upstreamSkillsRoot: string, vendorRoot: string): Promise<TreeChange[]> {
	const changes: TreeChange[] = [];
	for (const category of CATEGORIES) {
		const upstream = await fileMap(path.join(upstreamSkillsRoot, category));
		const vendored = await fileMap(path.join(vendorRoot, category));
		for (const relativePath of new Set([...upstream.keys(), ...vendored.keys()])) {
			const kind = !vendored.has(relativePath) ? "added" : !upstream.has(relativePath) ? "removed" : equalBytes(upstream.get(relativePath), vendored.get(relativePath)) ? undefined : "changed";
			if (kind) changes.push({ category, path: relativePath, kind });
		}
	}
	return changes.sort((a, b) => `${a.category}/${a.path}`.localeCompare(`${b.category}/${b.path}`));
}

export async function findDuplicateSkillNames(upstreamSkillsRoot: string): Promise<string[]> {
	const owners = new Map<string, string[]>();
	for (const category of CATEGORIES) {
		const files = await fileMap(path.join(upstreamSkillsRoot, category));
		for (const relativePath of files.keys()) {
			if (path.basename(relativePath) !== "SKILL.md") continue;
			const skillName = path.basename(path.dirname(relativePath));
			owners.set(skillName, [...(owners.get(skillName) ?? []), `${category}/${path.dirname(relativePath)}`]);
		}
	}
	return [...owners.entries()].filter(([, paths]) => paths.length > 1).map(([name, paths]) => `${name}: ${paths.join(", ")}`).sort();
}

export async function verifyExactCopy(upstreamSkillsRoot: string, vendorRoot: string): Promise<void> {
	const differences = await compareCategoryTrees(upstreamSkillsRoot, vendorRoot);
	if (differences.length) throw new Error(`Vendored copy verification failed: ${differences.slice(0, 10).map((item) => `${item.kind} ${item.category}/${item.path}`).join(", ")}`);
	if (existsSync(path.join(vendorRoot, "deprecated"))) throw new Error("Deprecated category must not be vendored.");
}

export async function syncFromCheckout(cloneDir: string, vendorRoot: string, ref: string, dryRun = false): Promise<TreeChange[]> {
	const upstreamSkillsRoot = path.join(cloneDir, "skills");
	const missing = CATEGORIES.filter((category) => !existsSync(path.join(upstreamSkillsRoot, category)));
	if (missing.length) throw new Error(`Expected upstream categor${missing.length === 1 ? "y" : "ies"} not found: ${missing.join(", ")}`);
	const duplicates = await findDuplicateSkillNames(upstreamSkillsRoot);
	if (duplicates.length) throw new Error(`Duplicate skill names across non-deprecated categories: ${duplicates.join("; ")}`);
	const changes = await compareCategoryTrees(upstreamSkillsRoot, vendorRoot);
	if (dryRun) return changes;

	await mkdir(vendorRoot, { recursive: true });
	await rm(path.join(vendorRoot, "deprecated"), { recursive: true, force: true });
	for (const category of CATEGORIES) {
		const destination = path.join(vendorRoot, category);
		await rm(destination, { recursive: true, force: true });
		await cp(path.join(upstreamSkillsRoot, category), destination, { recursive: true });
	}
	const licenseSource = path.join(cloneDir, "LICENSE");
	if (existsSync(licenseSource)) await cp(licenseSource, path.join(vendorRoot, "LICENSE"));
	await verifyExactCopy(upstreamSkillsRoot, vendorRoot);
	const metadata: SourceMetadata = { repo: REPO, ref, paths: CATEGORIES.map((category) => `skills/${category}`), updatedAt: new Date().toISOString() };
	await writeFile(path.join(vendorRoot, "SOURCE.json"), `${JSON.stringify(metadata, null, 2)}\n`);
	return changes;
}

async function main(): Promise<void> {
	const dryRun = new Set(Bun.argv.slice(2)).has("--dry-run");
	const tempRoot = await mkdtemp(path.join(tmpdir(), "mattpocock-skills-"));
	const cloneDir = path.join(tempRoot, "skills");
	try {
		await $`git clone --depth 1 --branch main --single-branch ${REPO} ${cloneDir}`.quiet();
		const ref = (await $`git -C ${cloneDir} rev-parse HEAD`.text()).trim();
		const changes = await syncFromCheckout(cloneDir, VENDOR_ROOT, ref, dryRun);
		console.log(`${dryRun ? "Would sync" : "Synced"} ${REPO}`);
		console.log(`Upstream HEAD: ${ref}`);
		for (const category of CATEGORIES) {
			const categoryChanges = changes.filter((item) => item.category === category);
			console.log(`${category}: ${categoryChanges.length} path change(s)`);
			for (const item of categoryChanges) console.log(`  ${item.kind} ${item.path}`);
		}
		if (!dryRun) console.log(`Destination: ${VENDOR_ROOT}`);
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

if (import.meta.main) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
