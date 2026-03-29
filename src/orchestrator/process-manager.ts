import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { AgentConfig, AgentResult, HarnessEvent } from "../types.js";

interface Emitter {
	emit(event: HarnessEvent): void;
}

export class ProcessManager {
	constructor(
		private emitter: Emitter,
		private claudeBinary: string = "claude",
	) {}

	async spawn(config: AgentConfig): Promise<AgentResult> {
		const args = this.buildArgs(config);
		this.emitter.emit({ type: "agent:start", agent: config.role });

		return new Promise((resolve) => {
			const proc = spawn(this.claudeBinary, args, {
				cwd: config.workingDir,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			});

			const stdoutChunks: string[] = [];
			const stderrChunks: string[] = [];

			proc.stdout.on("data", (data: Buffer) => {
				const text = data.toString();
				stdoutChunks.push(text);
				for (const line of text.split("\n").filter(Boolean)) {
					this.emitter.emit({ type: "agent:output", agent: config.role, line });
				}
			});

			proc.stderr.on("data", (data: Buffer) => {
				stderrChunks.push(data.toString());
			});

			proc.on("close", (code) => {
				const exitCode = code ?? 1;
				this.emitter.emit({ type: "agent:exit", agent: config.role, exitCode });
				resolve({ exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") });
			});

			proc.on("error", (err) => {
				this.emitter.emit({
					type: "error",
					message: `Failed to spawn ${config.role}: ${err.message}`,
				});
				resolve({ exitCode: 1, stdout: stdoutChunks.join(""), stderr: err.message });
			});
		});
	}

	private buildArgs(config: AgentConfig): string[] {
		const systemPromptContent = readFileSync(config.systemPrompt, "utf-8");
		const args = [
			"-p",
			config.inputPrompt,
			"--system-prompt",
			systemPromptContent,
			"--tools",
			config.allowedTools.join(","),
			"--output-format",
			"text",
			"--permission-mode",
			"bypassPermissions",
		];
		if (config.maxTurns !== undefined) {
			args.push("--max-turns", String(config.maxTurns));
		}
		return args;
	}
}
