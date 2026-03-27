import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config/loader.js";
import { HarnessEmitter } from "../events/emitter.js";
import { TextRenderer } from "../events/text-renderer.js";
import { runHarnessLoop } from "../orchestrator/loop.js";
import { ProcessManager } from "../orchestrator/process-manager.js";
import type { Verbosity } from "../types.js";

export interface RunOptions {
	spec?: string;
	specFile?: string;
	config?: string;
	resume?: boolean;
	verbosity: Verbosity;
}

export async function runCommand(options: RunOptions): Promise<void> {
	if (options.resume) {
		console.error("Resume not yet implemented");
		process.exit(1);
	}

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

	const result = await runHarnessLoop({
		config,
		projectDir: process.cwd(),
		spec: taskSpec,
		specFile: options.specFile,
		emitter,
		processManager: pm,
	});

	renderer.dispose();
	process.exit(result.success ? 0 : 1);
}
