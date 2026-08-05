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
const EXCLUDED_CATEGORIES = new Set(["deprecated"]);
const EXTENSION_ROOT = path.resolve(import.meta.dir, "..");
const VENDOR_ROOT = path.join(EXTENSION_ROOT, "vendor", "mattpocock-skills");

async function directoryNames(root: string): Promise<string[]> {
	if (!existsSync(root)) return [];
	return (await readdir(root, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

export async function nonDeprecatedCategories(upstreamSkillsRoot: string): Promise<string[]> {
	return (await directoryNames(upstreamSkillsRoot)).filter((category) => !EXCLUDED_CATEGORIES.has(category));
}

async function categoryNamesForTrees(upstreamSkillsRoot: string, vendorRoot: string): Promise<string[]> {
	return [...new Set([
		...await nonDeprecatedCategories(upstreamSkillsRoot),
		...(await directoryNames(vendorRoot)).filter((category) => !EXCLUDED_CATEGORIES.has(category)),
	])].sort();
}

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
	for (const category of await categoryNamesForTrees(upstreamSkillsRoot, vendorRoot)) {
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
	for (const category of await nonDeprecatedCategories(upstreamSkillsRoot)) {
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
	const categories = await nonDeprecatedCategories(upstreamSkillsRoot);
	if (!categories.length) throw new Error("No non-deprecated upstream skill categories found.");
	const duplicates = await findDuplicateSkillNames(upstreamSkillsRoot);
	if (duplicates.length) throw new Error(`Duplicate skill names across non-deprecated categories: ${duplicates.join("; ")}`);
	const changes = await compareCategoryTrees(upstreamSkillsRoot, vendorRoot);
	if (dryRun) return changes;

	await mkdir(vendorRoot, { recursive: true });
	for (const category of await directoryNames(vendorRoot)) {
		await rm(path.join(vendorRoot, category), { recursive: true, force: true });
	}
	for (const category of categories) {
		await cp(path.join(upstreamSkillsRoot, category), path.join(vendorRoot, category), { recursive: true });
	}
	const licenseSource = path.join(cloneDir, "LICENSE");
	if (existsSync(licenseSource)) await cp(licenseSource, path.join(vendorRoot, "LICENSE"));
	await verifyExactCopy(upstreamSkillsRoot, vendorRoot);
	const metadata: SourceMetadata = { repo: REPO, ref, paths: categories.map((category) => `skills/${category}`), updatedAt: new Date().toISOString() };
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
		const categories = await categoryNamesForTrees(path.join(cloneDir, "skills"), VENDOR_ROOT);
		const changes = await syncFromCheckout(cloneDir, VENDOR_ROOT, ref, dryRun);
		console.log(`${dryRun ? "Would sync" : "Synced"} ${REPO}`);
		console.log(`Upstream HEAD: ${ref}`);
		for (const category of categories) {
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
