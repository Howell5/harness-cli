import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCriteria } from "../../src/evaluator/criteria-loader.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/criteria");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("loadCriteria", () => {
	it("loads and validates criteria YAML", () => {
		const file = join(TMP, "criteria.yaml");
		writeFileSync(
			file,
			`dimensions:
  - id: functionality
    weight: 0.6
    checklist:
      - "App starts without errors"
  - id: code_quality
    weight: 0.4
    checklist:
      - "No TypeScript errors"
passing_threshold: 7.5
`,
		);
		const criteria = loadCriteria(file);
		expect(criteria.dimensions).toHaveLength(2);
		expect(criteria.dimensions[0].id).toBe("functionality");
		expect(criteria.passing_threshold).toBe(7.5);
	});

	it("throws if weights do not sum to 1.0", () => {
		const file = join(TMP, "bad.yaml");
		writeFileSync(
			file,
			`dimensions:
  - id: a
    weight: 0.3
    checklist: ["x"]
  - id: b
    weight: 0.3
    checklist: ["y"]
passing_threshold: 7.0
`,
		);
		expect(() => loadCriteria(file)).toThrow(/weights must sum to 1/i);
	});

	it("throws if dimensions array is empty", () => {
		const file = join(TMP, "empty.yaml");
		writeFileSync(file, "dimensions: []\npassing_threshold: 7.0\n");
		expect(() => loadCriteria(file)).toThrow(/at least one dimension/i);
	});
});
