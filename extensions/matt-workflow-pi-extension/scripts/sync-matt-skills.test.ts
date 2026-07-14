import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CATEGORIES, compareCategoryTrees, findDuplicateSkillNames, syncFromCheckout, verifyExactCopy } from "./sync-matt-skills";

const roots: string[] = [];
function fixture(): { clone: string; vendor: string } {
	const root = mkdtempSync(path.join(tmpdir(), "matt-sync-test-"));
	roots.push(root);
	const clone = path.join(root, "clone");
	const vendor = path.join(root, "vendor");
	for (const category of CATEGORIES) {
		const directory = path.join(clone, "skills", category, `${category}-skill`);
		mkdirSync(directory, { recursive: true });
		writeFileSync(path.join(directory, "SKILL.md"), `# ${category}\n`);
	}
	writeFileSync(path.join(clone, "LICENSE"), "MIT\n");
	return { clone, vendor };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Matt skill sync", () => {
	test("dry run reports added/removed/changed paths without mutation", async () => {
		const { clone, vendor } = fixture();
		mkdirSync(path.join(vendor, "engineering", "stale"), { recursive: true });
		writeFileSync(path.join(vendor, "engineering", "stale", "SKILL.md"), "stale");
		mkdirSync(path.join(vendor, "productivity", "productivity-skill"), { recursive: true });
		writeFileSync(path.join(vendor, "productivity", "productivity-skill", "SKILL.md"), "old");
		const changes = await syncFromCheckout(clone, vendor, "abc", true);
		expect(changes.some((item) => item.kind === "removed" && item.path === "stale/SKILL.md")).toBe(true);
		expect(changes.some((item) => item.kind === "changed" && item.category === "productivity")).toBe(true);
		expect(existsSync(path.join(vendor, "SOURCE.json"))).toBe(false);
	});

	test("replaces whole categories, excludes deprecated, verifies exact copies, then writes metadata", async () => {
		const { clone, vendor } = fixture();
		mkdirSync(path.join(vendor, "deprecated"), { recursive: true });
		await syncFromCheckout(clone, vendor, "abc123");
		await verifyExactCopy(path.join(clone, "skills"), vendor);
		expect(existsSync(path.join(vendor, "deprecated"))).toBe(false);
		expect(JSON.parse(readFileSync(path.join(vendor, "SOURCE.json"), "utf8")).ref).toBe("abc123");
		expect((await compareCategoryTrees(path.join(clone, "skills"), vendor))).toEqual([]);
	});

	test("rejects duplicate skill names across categories", async () => {
		const { clone } = fixture();
		for (const category of ["engineering", "productivity"]) {
			const directory = path.join(clone, "skills", category, "duplicate");
			mkdirSync(directory, { recursive: true });
			writeFileSync(path.join(directory, "SKILL.md"), "# duplicate\n");
		}
		expect(await findDuplicateSkillNames(path.join(clone, "skills"))).toContain("duplicate: engineering/duplicate, productivity/duplicate");
	});
});
