import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Verbosity } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
	printHelp();
	process.exit(0);
}

if (command === "--version" || command === "-V" || command === "version") {
	const pkg = JSON.parse(readFileSync(findPackageJson(__dirname), "utf-8"));
	console.log(pkg.version);
	process.exit(0);
}

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

function getVerbosity(argv: string[]): Verbosity {
	if (argv.includes("-v")) return 1;
	return 0;
}

async function main() {
	switch (command) {
		case "run": {
			const { values } = parseArgs({
				args: args.slice(1),
				options: {
					spec: { type: "string" },
					"spec-file": { type: "string" },
					config: { type: "string" },
					resume: { type: "boolean", default: false },
				},
				strict: false,
			});
			const { runCommand } = await import("../src/commands/run.js");
			await runCommand({
				spec: values.spec as string | undefined,
				specFile: values["spec-file"] as string | undefined,
				config: values.config as string | undefined,
				resume: values.resume as boolean,
				verbosity: getVerbosity(args),
			});
			break;
		}
		case "plan": {
			const { values } = parseArgs({
				args: args.slice(1),
				options: {
					spec: { type: "string" },
					"spec-file": { type: "string" },
					output: { type: "string" },
					config: { type: "string" },
				},
				strict: false,
			});
			const { planCommand } = await import("../src/commands/plan.js");
			await planCommand({
				spec: values.spec as string | undefined,
				specFile: values["spec-file"] as string | undefined,
				output: values.output as string | undefined,
				config: values.config as string | undefined,
				verbosity: getVerbosity(args),
			});
			break;
		}
		case "eval": {
			const { values } = parseArgs({
				args: args.slice(1),
				options: {
					criteria: { type: "string" },
					url: { type: "string" },
					config: { type: "string" },
				},
				strict: false,
			});
			if (!values.criteria) {
				console.error("--criteria is required for eval command");
				process.exit(1);
			}
			const { evalCommand } = await import("../src/commands/eval.js");
			await evalCommand({
				criteria: values.criteria as string,
				url: values.url as string | undefined,
				config: values.config as string | undefined,
				verbosity: getVerbosity(args),
			});
			break;
		}
		case "init": {
			const { initCommand } = await import("../src/commands/init.js");
			initCommand();
			break;
		}
		default:
			console.error(`Unknown command: ${command}`);
			printHelp();
			process.exit(1);
	}
}

function printHelp() {
	console.log(`
harnex — Multi-agent orchestration for Claude Code

Usage:
  harnex run --spec "..."              Full plan → generate → evaluate loop
  harnex run --spec-file ./task.md     Spec from file
  harnex run --resume                  Resume from .harnex/state.yaml
  harnex plan --spec "..."             Run planner only
  harnex eval --criteria ./criteria.yaml  Run evaluator only
  harnex init                          Initialize harnex.yaml + criteria in current dir
  harnex version                       Show version

Options:
  --config <path>    Path to harnex.yaml config
  -v                 Verbose output (full agent stdout)
  -h, --help         Show this help
`);
}

main().catch((err) => {
	console.error("Fatal error:", err.message);
	process.exit(1);
});
