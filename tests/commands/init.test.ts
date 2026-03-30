import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("initCommand", () => {
	let tempDir: string;
	const originalCwd = process.cwd;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "harnex-init-"));
		vi.spyOn(process, "cwd").mockReturnValue(tempDir);
	});

	afterEach(() => {
		process.cwd = originalCwd;
		vi.restoreAllMocks();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates harnex.yaml and criteria/default.yaml", async () => {
		const { initCommand } = await import("../../src/commands/init.js");
		initCommand();

		expect(existsSync(join(tempDir, "harnex.yaml"))).toBe(true);
		expect(existsSync(join(tempDir, "criteria", "default.yaml"))).toBe(true);

		const config = readFileSync(join(tempDir, "harnex.yaml"), "utf-8");
		expect(config).toContain("max_iterations");
	});

	it("skips existing files", async () => {
		const { initCommand } = await import("../../src/commands/init.js");
		initCommand();

		const original = readFileSync(join(tempDir, "harnex.yaml"), "utf-8");
		initCommand();

		const after = readFileSync(join(tempDir, "harnex.yaml"), "utf-8");
		expect(after).toBe(original);
	});
});
