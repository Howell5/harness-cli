import chalk from "chalk";
import type { AgentRole, HarnessEvent, Verbosity } from "../types.js";

type OutputFn = (line: string) => void;

const AGENT_PREFIX: Record<AgentRole, string> = {
	planner: chalk.cyan("[PLAN]    "),
	generator: chalk.green("[GEN]     "),
	evaluator: chalk.yellow("[EVAL]    "),
};

const HARNESS_PREFIX = chalk.white.bold("[HARNESS] ");
const ERROR_PREFIX = chalk.red("[ERROR]   ");

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h ${remainingMinutes}m`;
}

export class TextRenderer {
	private unsub: () => void;

	constructor(
		emitter: { on: (handler: (event: HarnessEvent) => void) => () => void },
		private verbosity: Verbosity,
		private output: OutputFn = console.log,
	) {
		this.unsub = emitter.on((event) => this.handle(event));
	}

	dispose(): void {
		this.unsub();
	}

	private handle(event: HarnessEvent): void {
		switch (event.type) {
			case "harness:start":
				this.output(`${HARNESS_PREFIX}Task started: ${event.task}`);
				break;
			case "harness:done":
				this.output(
					`${HARNESS_PREFIX}${chalk.green("✓")} Done, ${event.iterations} iteration(s), ${event.resets} reset(s), final score ${event.score}`,
				);
				break;
			case "agent:start": {
				const parts: string[] = [];
				if (event.iteration !== undefined) parts.push(`iter ${event.iteration}`);
				if (event.featuresCompleted !== undefined && event.featuresTotal !== undefined) {
					parts.push(`${event.featuresCompleted}/${event.featuresTotal} features`);
				}
				const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "...";
				this.output(`${AGENT_PREFIX[event.agent]}Starting${suffix}`);
				break;
			}
			case "agent:output":
				if (this.verbosity >= 1) {
					this.output(`${AGENT_PREFIX[event.agent]}${event.line}`);
				}
				break;
			case "agent:exit": {
				const duration = formatDuration(event.durationMs);
				if (event.exitCode === 0) {
					this.output(`${AGENT_PREFIX[event.agent]}Done (${duration})`);
				} else {
					this.output(
						`${AGENT_PREFIX[event.agent]}Failed (exit ${event.exitCode}, ${duration})`,
					);
				}
				break;
			}
			case "agent:reset":
				this.output(
					`${AGENT_PREFIX[event.agent]}${chalk.yellow("⚠")} Context reset #${event.count}`,
				);
				break;
			case "eval:score": {
				const scoreEntries = Object.entries(event.scores)
					.map(([k, v]) => `${k} ${v}`)
					.join(" / ");
				const indicator = event.passed ? chalk.green("✓") : chalk.red("✗");
				this.output(`${AGENT_PREFIX.evaluator}${scoreEntries} → avg ${event.avg} ${indicator}`);
				break;
			}
			case "feature:complete":
				this.output(
					`${AGENT_PREFIX.generator}${event.id}: ${event.desc} ${chalk.green("✓")}${event.commit ? `  commit ${event.commit}` : ""}`,
				);
				break;
			case "error":
				this.output(`${ERROR_PREFIX}${event.message}`);
				break;
		}
	}
}
