import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config/loader.js";
import { loadCriteria } from "../evaluator/criteria-loader.js";
import { HarnessEmitter } from "../events/emitter.js";
import { TextRenderer } from "../events/text-renderer.js";
import { ProcessManager } from "../orchestrator/process-manager.js";
import type { Verbosity } from "../types.js";

export interface EvalOptions {
	criteria: string;
	url?: string;
	config?: string;
	verbosity: Verbosity;
}

export async function evalCommand(options: EvalOptions): Promise<void> {
	const criteriaPath = resolve(options.criteria);
	if (!existsSync(criteriaPath)) {
		console.error(`Criteria file not found: ${criteriaPath}`);
		process.exit(1);
	}

	loadCriteria(criteriaPath); // validate

	const config = loadConfig(options.config);
	const emitter = new HarnessEmitter();
	const renderer = new TextRenderer(emitter, options.verbosity);
	const pm = new ProcessManager(emitter);

	const prompt = options.url
		? `Evaluate the project. Criteria: ${criteriaPath}\nURL: ${options.url}\n\nWrite scores.json and feedback.md.`
		: `Evaluate the project. Criteria: ${criteriaPath}\n\nWrite scores.json and feedback.md.`;

	const result = await pm.spawn({
		role: "evaluator",
		systemPrompt: config.prompts.evaluator,
		allowedTools: config.evaluator.allowed_tools,
		inputPrompt: prompt,
		workingDir: process.cwd(),
	});

	renderer.dispose();

	const scoresPath = resolve("scores.json");
	if (existsSync(scoresPath)) {
		console.log(
			"\nScores:",
			JSON.stringify(JSON.parse(readFileSync(scoresPath, "utf-8")), null, 2),
		);
	}

	process.exit(result.exitCode === 0 ? 0 : 1);
}
