import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getCompletedCount,
	getPendingFeatures,
	isAllComplete,
	loadFeatureList,
	saveFeatureList,
} from "../../src/state/feature-list.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/features");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("feature-list", () => {
	const filePath = () => join(TMP, "feature-list.json");

	it("saves and loads feature list", () => {
		const features = [
			{ id: "feat-001", desc: "Add login", status: "pending" as const },
			{ id: "feat-002", desc: "Add logout", status: "completed" as const, commit: "abc123" },
		];
		saveFeatureList(filePath(), features);
		expect(loadFeatureList(filePath())).toEqual(features);
	});

	it("returns empty array if file does not exist", () => {
		expect(loadFeatureList(join(TMP, "nonexistent.json"))).toEqual([]);
	});

	it("getPendingFeatures returns only pending items", () => {
		const features = [
			{ id: "feat-001", desc: "A", status: "completed" as const },
			{ id: "feat-002", desc: "B", status: "pending" as const },
			{ id: "feat-003", desc: "C", status: "in_progress" as const },
		];
		expect(getPendingFeatures(features)).toEqual([features[1]]);
	});

	it("getCompletedCount returns correct count", () => {
		const features = [
			{ id: "feat-001", desc: "A", status: "completed" as const },
			{ id: "feat-002", desc: "B", status: "completed" as const },
			{ id: "feat-003", desc: "C", status: "pending" as const },
		];
		expect(getCompletedCount(features)).toBe(2);
	});

	it("isAllComplete works correctly", () => {
		expect(
			isAllComplete([
				{ id: "1", desc: "A", status: "completed" },
				{ id: "2", desc: "B", status: "completed" },
			]),
		).toBe(true);
		expect(
			isAllComplete([
				{ id: "1", desc: "A", status: "completed" },
				{ id: "2", desc: "B", status: "pending" },
			]),
		).toBe(false);
	});
});
