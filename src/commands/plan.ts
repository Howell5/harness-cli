import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config/loader.js";
import { HarnessEmitter } from "../events/emitter.js";
import { TextRenderer } from "../events/text-renderer.js";
import { ProcessManager } from "../orchestrator/process-manager.js";
import type { Verbosity } from "../types.js";

export interface PlanOptions {
	spec?: string;
	specFile?: string;
	output?: string;
	config?: string;
	verbosity: Verbosity;
}

export async function planCommand(options: PlanOptions): Promise<void> {
	let taskSpec: string;
	if (options.specFile) {
		taskSpec = readFileSync(resolve(options.specFile), "utf-8");
	} else if (options.spec) {
		taskSpec = options.spec;
	} else {
		console.error("Either --spec or --spec-file is required");
		process.exit(1);
		return; // unreachable, but satisfies TypeScript
	}

	const config = loadConfig(options.config);
	const emitter = new HarnessEmitter();
	const renderer = new TextRenderer(emitter, options.verbosity);
	const pm = new ProcessManager(emitter);

	const prompt = options.output
		? `Task: ${taskSpec}\n\nCreate the spec at ${options.output} and feature-list.json.`
		: `Task: ${taskSpec}\n\nCreate spec.md and feature-list.json. Read the existing codebase first.`;

	const result = await pm.spawn({
		role: "planner",
		systemPrompt: config.prompts.planner,
		allowedTools: config.planner.allowed_tools,
		inputPrompt: prompt,
		workingDir: process.cwd(),
	});

	renderer.dispose();
	process.exit(result.exitCode === 0 ? 0 : 1);
}
