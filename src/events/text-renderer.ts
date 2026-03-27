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
			case "agent:start":
				this.output(`${AGENT_PREFIX[event.agent]}Starting...`);
				break;
			case "agent:output":
				if (this.verbosity >= 1) {
					this.output(`${AGENT_PREFIX[event.agent]}${event.line}`);
				}
				break;
			case "agent:exit":
				if (this.verbosity >= 1) {
					this.output(`${AGENT_PREFIX[event.agent]}Exited (code ${event.exitCode})`);
				}
				break;
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
