import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StateStore } from "../../src/state/state-store.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/state");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("StateStore", () => {
	it("creates initial state for a new task", () => {
		const store = new StateStore(TMP);
		const state = store.initialize("Build a todo app", 15);
		expect(state.version).toBe("1");
		expect(state.task.description).toBe("Build a todo app");
		expect(state.progress.phase).toBe("planning");
		expect(existsSync(join(TMP, "state.yaml"))).toBe(true);
	});

	it("loads existing state", () => {
		const store = new StateStore(TMP);
		store.initialize("Build a todo app", 15);
		const loaded = new StateStore(TMP).load();
		expect(loaded).not.toBeNull();
		expect(loaded?.task.description).toBe("Build a todo app");
	});

	it("returns null when no state file exists", () => {
		const emptyDir = join(TMP, "empty");
		mkdirSync(emptyDir, { recursive: true });
		expect(new StateStore(emptyDir).load()).toBeNull();
	});

	it("updates phase", () => {
		const store = new StateStore(TMP);
		store.initialize("task", 10);
		store.updatePhase("generation");
		expect(store.load()?.progress.phase).toBe("generation");
	});

	it("records evaluation", () => {
		const store = new StateStore(TMP);
		store.initialize("task", 10);
		store.addEvaluation({
			iteration: 1,
			scores: { quality: 8.0 },
			weighted_avg: 8.0,
			passed: true,
			feedback_file: ".harnex/feedback/iter-1.md",
		});
		const loaded = store.load();
		if (!loaded) throw new Error("State not found");
		expect(loaded.evaluations).toHaveLength(1);
		expect(loaded.evaluations[0].weighted_avg).toBe(8.0);
	});
});
