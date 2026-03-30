# Verbosity Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign verbosity so the default experience shows the multi-agent orchestration flow, not silence.

**Architecture:** Two levels (normal=0, verbose=1). Enrich `agent:start` and `agent:exit` event types with context fields. Move `agent:start` emit from ProcessManager to loop.ts. TextRenderer stays a pure stateless renderer.

**Tech Stack:** TypeScript, vitest

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `src/types.ts` | Event types + Verbosity | Modify |
| `src/orchestrator/process-manager.ts` | Spawn claude, emit exit with duration | Modify |
| `src/orchestrator/loop.ts` | Orchestration loop, emit agent:start with context | Modify |
| `src/events/text-renderer.ts` | Event → colored text | Modify |
| `bin/harnex.ts` | CLI entry, verbosity parsing, help | Modify |
| `tests/events/text-renderer.test.ts` | Renderer tests | Modify |

---

### Task 1: Update types

**Files:**
- Modify: `src/types.ts:90-107`

- [ ] **Step 1: Write the updated types**

Change `Verbosity` and event types in `src/types.ts`:

```typescript
export type HarnessEvent =
	| { type: "harness:start"; task: string }
	| { type: "harness:done"; iterations: number; resets: number; score: number }
	| { type: "agent:start"; agent: AgentRole; iteration?: number; featuresCompleted?: number; featuresTotal?: number }
	| { type: "agent:output"; agent: AgentRole; line: string }
	| { type: "agent:exit"; agent: AgentRole; exitCode: number; durationMs: number }
	| { type: "agent:reset"; agent: AgentRole; count: number }
	| {
			type: "eval:score";
			iteration: number;
			scores: EvalScores;
			avg: number;
			passed: boolean;
	  }
	| { type: "feature:complete"; id: string; desc: string; commit?: string }
	| { type: "error"; message: string };

export type Verbosity = 0 | 1;
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Type errors in process-manager.ts, loop.ts, text-renderer.ts, and test files (because they don't yet provide `durationMs` or match the new type). This confirms the type changes propagate.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "refactor: update event types for verbosity redesign

agent:start gains iteration/features context fields.
agent:exit gains durationMs. Verbosity narrowed to 0|1."
```

---

### Task 2: Update ProcessManager — add duration, remove agent:start emit

**Files:**
- Modify: `src/orchestrator/process-manager.ts:9-55`

- [ ] **Step 1: Update ProcessManager**

Replace the `spawn` method in `src/orchestrator/process-manager.ts`:

```typescript
export class ProcessManager {
	constructor(
		private emitter: Emitter,
		private claudeBinary: string = "claude",
	) {}

	async spawn(config: AgentConfig): Promise<AgentResult> {
		const args = this.buildArgs(config);
		const startTime = Date.now();

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
				const durationMs = Date.now() - startTime;
				this.emitter.emit({ type: "agent:exit", agent: config.role, exitCode, durationMs });
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
		// unchanged
	}
}
```

Key changes: removed `agent:start` emit (line 17 in original), added `startTime` + `durationMs` computation.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors remain in loop.ts and text-renderer.ts (not yet updated), but process-manager.ts should be clean.

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator/process-manager.ts
git commit -m "refactor: ProcessManager adds durationMs, drops agent:start emit

agent:start responsibility moves to loop.ts which has iteration/feature context."
```

---

### Task 3: Update loop.ts — emit agent:start with context

**Files:**
- Modify: `src/orchestrator/loop.ts:27-180`

- [ ] **Step 1: Add agent:start emits before each spawn call**

Three spawn sites need `agent:start` emitted before them:

**Planner spawn (before line 42):**
```typescript
emitter.emit({ type: "agent:start", agent: "planner" });
```

**Generator spawn (before line 84):**
```typescript
const beforeFeatures = loadFeatureList(featureListPath);
const beforeCompleted = getCompletedCount(beforeFeatures);

emitter.emit({
	type: "agent:start",
	agent: "generator",
	iteration,
	featuresCompleted: beforeCompleted,
	featuresTotal: beforeFeatures.length,
});
```

Note: `beforeFeatures`/`beforeCompleted` are already computed right after this point in the original code (lines 81-82). Move them before the emit.

**Evaluator spawn (before line 134):**
```typescript
emitter.emit({
	type: "agent:start",
	agent: "evaluator",
	iteration,
	featuresCompleted: getCompletedCount(loadFeatureList(featureListPath)),
	featuresTotal: loadFeatureList(featureListPath).length,
});
```

Actually, to avoid loading feature list twice, use a local:
```typescript
const evalFeatures = loadFeatureList(featureListPath);
emitter.emit({
	type: "agent:start",
	agent: "evaluator",
	iteration,
	featuresCompleted: getCompletedCount(evalFeatures),
	featuresTotal: evalFeatures.length,
});
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Only text-renderer.ts and tests may have issues remaining.

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator/loop.ts
git commit -m "refactor: loop.ts emits agent:start with iteration/feature context"
```

---

### Task 4: Update TextRenderer — new rendering logic

**Files:**
- Modify: `src/events/text-renderer.ts`

- [ ] **Step 1: Add duration formatter helper**

Add at the top of `src/events/text-renderer.ts` (after the existing constants):

```typescript
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
```

- [ ] **Step 2: Rewrite the handle method**

Replace the `handle` method:

```typescript
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
				this.output(`${AGENT_PREFIX[event.agent]}Failed (exit ${event.exitCode}, ${duration})`);
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
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean (tests may still fail since they pass verbosity `2` or expect old behavior).

- [ ] **Step 4: Commit**

```bash
git add src/events/text-renderer.ts
git commit -m "refactor: TextRenderer shows flow by default, adds duration formatting

agent:start renders iteration/feature context.
agent:exit always shown with human-readable duration.
agent:output gated behind verbosity >= 1 (unchanged semantics)."
```

---

### Task 5: Update CLI entry point

**Files:**
- Modify: `bin/harnex.ts:12-16,103-108`

- [ ] **Step 1: Simplify getVerbosity**

Replace the `getVerbosity` function:

```typescript
function getVerbosity(argv: string[]): Verbosity {
	if (argv.includes("-v")) return 1;
	return 0;
}
```

- [ ] **Step 2: Update help text**

Replace the Options section in `printHelp`:

```typescript
function printHelp() {
	console.log(`
harnex — Multi-agent orchestration for Claude Code

Usage:
  harnex run --spec "..."              Full plan → generate → evaluate loop
  harnex run --spec-file ./task.md     Spec from file
  harnex run --resume                  Resume from .harnex/state.yaml
  harnex plan --spec "..."             Run planner only
  harnex eval --criteria ./criteria.yaml  Run evaluator only

Options:
  --config <path>    Path to harnex.yaml config
  -v                 Verbose output (full agent stdout)
  -h, --help         Show this help
`);
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add bin/harnex.ts
git commit -m "refactor: simplify CLI verbosity to two levels, update help text"
```

---

### Task 6: Update tests

**Files:**
- Modify: `tests/events/text-renderer.test.ts`

- [ ] **Step 1: Rewrite test file**

Replace `tests/events/text-renderer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";
import { TextRenderer } from "../../src/events/text-renderer.js";

describe("TextRenderer", () => {
	function setup(verbosity: 0 | 1 = 0) {
		const emitter = new HarnessEmitter();
		const output: string[] = [];
		const renderer = new TextRenderer(emitter, verbosity, (line) => output.push(line));
		return { emitter, output, renderer };
	}

	it("renders harness:start with [HARNESS] prefix", () => {
		const { emitter, output } = setup();
		emitter.emit({ type: "harness:start", task: "test task" });
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[HARNESS]");
		expect(output[0]).toContain("test task");
	});

	it("renders agent:start without context for planner", () => {
		const { emitter, output } = setup();
		emitter.emit({ type: "agent:start", agent: "planner" });
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[PLAN]");
		expect(output[0]).toContain("Starting...");
	});

	it("renders agent:start with iteration and feature context", () => {
		const { emitter, output } = setup();
		emitter.emit({
			type: "agent:start",
			agent: "generator",
			iteration: 2,
			featuresCompleted: 3,
			featuresTotal: 7,
		});
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[GEN]");
		expect(output[0]).toContain("iter 2");
		expect(output[0]).toContain("3/7 features");
	});

	it("renders agent:exit with duration at verbosity 0", () => {
		const { emitter, output } = setup(0);
		emitter.emit({ type: "agent:exit", agent: "planner", exitCode: 0, durationMs: 42000 });
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[PLAN]");
		expect(output[0]).toContain("Done");
		expect(output[0]).toContain("42s");
	});

	it("renders agent:exit with failure and duration", () => {
		const { emitter, output } = setup();
		emitter.emit({ type: "agent:exit", agent: "generator", exitCode: 1, durationMs: 192000 });
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[GEN]");
		expect(output[0]).toContain("Failed");
		expect(output[0]).toContain("exit 1");
		expect(output[0]).toContain("3m 12s");
	});

	it("renders agent:output only at verbosity 1", () => {
		const { emitter, output } = setup(0);
		emitter.emit({ type: "agent:output", agent: "generator", line: "writing file" });
		expect(output).toHaveLength(0);

		const s2 = setup(1);
		s2.emitter.emit({ type: "agent:output", agent: "generator", line: "writing file" });
		expect(s2.output).toHaveLength(1);
		expect(s2.output[0]).toContain("[GEN]");
	});

	it("renders eval:score with score value", () => {
		const { emitter, output } = setup();
		emitter.emit({
			type: "eval:score",
			iteration: 1,
			scores: { functionality: 8.5, code_quality: 7.2 },
			avg: 7.85,
			passed: false,
		});
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[EVAL]");
		expect(output[0]).toContain("7.85");
	});

	it("formats duration in hours for long runs", () => {
		const { emitter, output } = setup();
		emitter.emit({ type: "agent:exit", agent: "evaluator", exitCode: 0, durationMs: 3723000 });
		expect(output[0]).toContain("1h 2m");
	});
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/events/text-renderer.test.ts
git commit -m "test: update text-renderer tests for new verbosity behavior

Tests cover: contextual agent:start, timed agent:exit, duration
formatting (seconds/minutes/hours), verbosity gating."
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: Clean.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean.
