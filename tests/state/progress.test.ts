import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeProgressFile } from "../../src/state/progress.js";
import type { Feature, HarnessState } from "../../src/types.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/progress");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("writeProgressFile", () => {
	it("generates human-readable progress", () => {
		const state: HarnessState = {
			version: "1",
			task: {
				id: "t-001",
				description: "Build feature X",
				spec_file: "./spec.md",
				started_at: "2026-03-28T10:00:00Z",
			},
			progress: {
				phase: "generation",
				iteration: 2,
				max_iterations: 15,
				features_total: 3,
				features_completed: 1,
			},
			context: { generator_reset_count: 1, last_reset_at: "2026-03-28T11:00:00Z" },
			evaluations: [],
		};
		const features: Feature[] = [
			{ id: "feat-001", desc: "Login page", status: "completed", commit: "abc123" },
			{ id: "feat-002", desc: "Dashboard", status: "in_progress" },
			{ id: "feat-003", desc: "Settings", status: "pending" },
		];
		const filePath = join(TMP, "progress.txt");
		writeProgressFile(filePath, state, features);
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("Build feature X");
		expect(content).toContain("feat-001");
		expect(content).toContain("Login page");
		expect(content).toContain("feat-003");
	});
});
