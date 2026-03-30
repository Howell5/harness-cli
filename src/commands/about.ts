import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { loadConfig } from "../config/loader.js";
import type { HarnessConfig } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPackageJson(from: string): string {
	let dir = from;
	while (true) {
		const candidate = resolve(dir, "package.json");
		try {
			readFileSync(candidate);
			return candidate;
		} catch {
			const parent = dirname(dir);
			if (parent === dir) throw new Error("package.json not found");
			dir = parent;
		}
	}
}

function getVersion(): string {
	const pkgPath = findPackageJson(__dirname);
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	return pkg.version as string;
}

export interface AboutOptions {
	config?: string;
	json?: boolean;
}

export interface AboutInfo {
	name: string;
	description: string;
	version: string;
	architecture: {
		pipeline: string;
		agents: {
			planner: string;
			generator: string;
			evaluator: string;
		};
	};
	config: {
		max_iterations: number;
		passing_threshold: number;
		planner: { allowed_tools: string[] };
		generator: { max_turns?: number; allowed_tools: string[] };
		evaluator: { allowed_tools: string[] };
	};
	prompts: {
		planner: string;
		generator: string;
		evaluator: string;
	};
}

export function collectAboutInfo(config: HarnessConfig): AboutInfo {
	return {
		name: "harnex",
		description: "Multi-agent orchestration for Claude Code",
		version: getVersion(),
		architecture: {
			pipeline: "Planner → Generator → Evaluator",
			agents: {
				planner: "Decomposes specs into ordered feature lists",
				generator: "Implements features one at a time with TDD",
				evaluator: "Scores output against weighted criteria checklists",
			},
		},
		config: {
			max_iterations: config.max_iterations,
			passing_threshold: config.passing_threshold,
			planner: { allowed_tools: config.planner.allowed_tools },
			generator: {
				max_turns: config.generator.max_turns,
				allowed_tools: config.generator.allowed_tools,
			},
			evaluator: { allowed_tools: config.evaluator.allowed_tools },
		},
		prompts: {
			planner: config.prompts.planner,
			generator: config.prompts.generator,
			evaluator: config.prompts.evaluator,
		},
	};
}

function printAboutText(info: AboutInfo): void {
	const header = chalk.white.bold;
	const plannerColor = chalk.cyan;
	const generatorColor = chalk.green;
	const evaluatorColor = chalk.yellow;

	console.log();
	console.log(`${header("harnex")} — ${info.description}`);
	console.log(`Version: ${info.version}`);

	console.log();
	console.log(header("Architecture"));
	console.log(`  Pipeline: ${info.architecture.pipeline}`);
	console.log(`  ${plannerColor("Planner")}    ${info.architecture.agents.planner}`);
	console.log(`  ${generatorColor("Generator")}  ${info.architecture.agents.generator}`);
	console.log(`  ${evaluatorColor("Evaluator")}  ${info.architecture.agents.evaluator}`);

	console.log();
	console.log(header("Configuration"));
	console.log(`  max_iterations:    ${info.config.max_iterations}`);
	console.log(`  passing_threshold: ${info.config.passing_threshold}`);

	console.log();
	console.log(
		`  ${plannerColor("Planner")} tools:    ${info.config.planner.allowed_tools.join(", ")}`,
	);
	console.log(
		`  ${generatorColor("Generator")} tools:  ${info.config.generator.allowed_tools.join(", ")}`,
	);
	if (info.config.generator.max_turns !== undefined) {
		console.log(`  ${generatorColor("Generator")} max_turns: ${info.config.generator.max_turns}`);
	}
	console.log(
		`  ${evaluatorColor("Evaluator")} tools:  ${info.config.evaluator.allowed_tools.join(", ")}`,
	);

	console.log();
	console.log(header("Prompt Files"));
	console.log(`  ${plannerColor("Planner")}:    ${info.prompts.planner}`);
	console.log(`  ${generatorColor("Generator")}:  ${info.prompts.generator}`);
	console.log(`  ${evaluatorColor("Evaluator")}:  ${info.prompts.evaluator}`);
	console.log();
}

export async function aboutCommand(options: AboutOptions): Promise<void> {
	const config = loadConfig(options.config);
	const info = collectAboutInfo(config);
	if (options.json) {
		console.log(JSON.stringify(info, null, 2));
	} else {
		printAboutText(info);
	}
}
