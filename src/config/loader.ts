import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { HarnessConfig } from "../types.js";

export const DEFAULT_CONFIG: HarnessConfig = {
	max_iterations: 15,
	passing_threshold: 7.5,
	generator: {
		max_turns: 50,
		allowed_tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
	},
	evaluator: {
		allowed_tools: ["Read", "Bash", "Glob", "Grep"],
		criteria_file: "./criteria/default.yaml",
	},
	planner: {
		allowed_tools: ["Read", "Write", "Glob", "Grep"],
	},
	prompts: {
		planner: "./prompts/planner.md",
		generator: "./prompts/generator.md",
		evaluator: "./prompts/evaluator.md",
	},
};

export function loadConfig(configPath?: string): HarnessConfig {
	if (!configPath) {
		return structuredClone(DEFAULT_CONFIG);
	}
	const raw = readFileSync(configPath, "utf-8");
	const userConfig = parseYaml(raw);
	if (typeof userConfig !== "object" || userConfig === null) {
		throw new Error(`Invalid config file: ${configPath}`);
	}
	return deepMerge(
		structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
		userConfig as Record<string, unknown>,
	) as unknown as HarnessConfig;
}

function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	for (const key of Object.keys(source)) {
		const sourceVal = source[key];
		const targetVal = target[key];
		if (
			typeof sourceVal === "object" &&
			sourceVal !== null &&
			!Array.isArray(sourceVal) &&
			typeof targetVal === "object" &&
			targetVal !== null &&
			!Array.isArray(targetVal)
		) {
			target[key] = deepMerge(
				targetVal as Record<string, unknown>,
				sourceVal as Record<string, unknown>,
			);
		} else {
			target[key] = sourceVal;
		}
	}
	return target;
}
