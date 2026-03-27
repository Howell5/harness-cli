import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../../src/config/loader.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/config");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("loadConfig", () => {
	it("returns defaults when no config file provided", () => {
		const config = loadConfig();
		expect(config.max_iterations).toBe(DEFAULT_CONFIG.max_iterations);
		expect(config.passing_threshold).toBe(DEFAULT_CONFIG.passing_threshold);
		expect(config.generator.max_turns).toBe(50);
	});

	it("merges user config over defaults", () => {
		const userConfig = join(TMP, "harness.yaml");
		writeFileSync(userConfig, "max_iterations: 5\npassing_threshold: 9.0\n");
		const config = loadConfig(userConfig);
		expect(config.max_iterations).toBe(5);
		expect(config.passing_threshold).toBe(9.0);
		expect(config.generator.max_turns).toBe(50);
	});

	it("throws on invalid YAML", () => {
		const badFile = join(TMP, "bad.yaml");
		writeFileSync(badFile, "{{invalid yaml");
		expect(() => loadConfig(badFile)).toThrow();
	});
});
