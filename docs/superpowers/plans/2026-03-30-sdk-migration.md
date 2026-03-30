# Agent SDK Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `child_process.spawn("claude", ...)` with `@anthropic-ai/claude-agent-sdk` query() for real-time tool call visibility.

**Architecture:** ProcessManager rewritten to use SDK message stream. New `agent:tool_call` and `agent:tool_result` events emitted from message stream parsing. TextRenderer extended with tool-specific rendering and a pending-tool buffer for tools that need result context.

**Tech Stack:** TypeScript, @anthropic-ai/claude-agent-sdk@0.2.87, vitest

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `src/types.ts` | Event types | Modify — add `agent:tool_call` and `agent:tool_result` |
| `src/orchestrator/process-manager.ts` | Spawn agents | Rewrite — SDK query() replaces child_process |
| `src/events/text-renderer.ts` | Event → colored text | Modify — add tool rendering with buffer |
| `tests/orchestrator/process-manager.test.ts` | ProcessManager tests | Rewrite — mock SDK instead of shell script |
| `tests/events/text-renderer.test.ts` | Renderer tests | Modify — add tool_call/tool_result tests |
| `tests/fixtures/mock-claude.sh` | Mock CLI | Delete — no longer needed |

---

### Task 1: Add new event types

**Files:**
- Modify: `src/types.ts:90-113`

- [ ] **Step 1: Add agent:tool_call and agent:tool_result event types**

In `src/types.ts`, replace the `HarnessEvent` type (lines 90-111) and `Verbosity` (line 113):

```typescript
export type HarnessEvent =
	| { type: "harness:start"; task: string }
	| { type: "harness:done"; iterations: number; resets: number; score: number }
	| {
			type: "agent:start";
			agent: AgentRole;
			iteration?: number;
			featuresCompleted?: number;
			featuresTotal?: number;
	  }
	| { type: "agent:output"; agent: AgentRole; line: string }
	| { type: "agent:exit"; agent: AgentRole; exitCode: number; durationMs: number }
	| { type: "agent:reset"; agent: AgentRole; count: number }
	| {
			type: "agent:tool_call";
			agent: AgentRole;
			tool: string;
			input: Record<string, unknown>;
	  }
	| {
			type: "agent:tool_result";
			agent: AgentRole;
			tool: string;
			result: string;
	  }
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
Expected: Clean (new types are additive, nothing uses them yet).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add agent:tool_call and agent:tool_result event types"
```

---

### Task 2: Rewrite ProcessManager to use Agent SDK

**Files:**
- Rewrite: `src/orchestrator/process-manager.ts`

- [ ] **Step 1: Rewrite process-manager.ts**

Replace the entire file with:

```typescript
import { readFileSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentConfig, AgentResult, AgentRole, HarnessEvent } from "../types.js";

interface Emitter {
	emit(event: HarnessEvent): void;
}

export class ProcessManager {
	constructor(private emitter: Emitter) {}

	async spawn(config: AgentConfig): Promise<AgentResult> {
		const systemPromptContent = readFileSync(config.systemPrompt, "utf-8");
		const startTime = Date.now();
		let resultText = "";
		let lastToolName = "";

		try {
			const response = query({
				prompt: config.inputPrompt,
				options: {
					systemPrompt: systemPromptContent,
					allowedTools: config.allowedTools,
					maxTurns: config.maxTurns,
					permissionMode: "bypassPermissions",
					cwd: config.workingDir,
				},
			});

			for await (const msg of response) {
				if (msg.type === "assistant" && msg.message?.content) {
					for (const block of msg.message.content) {
						if (block.type === "tool_use") {
							lastToolName = block.name;
							this.emitter.emit({
								type: "agent:tool_call",
								agent: config.role,
								tool: block.name,
								input: block.input as Record<string, unknown>,
							});
						}
					}
				}

				if (msg.type === "user" && msg.message?.content) {
					for (const block of msg.message.content) {
						if (block.type === "tool_result") {
							const content =
								typeof block.content === "string"
									? block.content
									: Array.isArray(block.content)
										? block.content.map((c: { text?: string }) => c.text ?? "").join("\n")
										: String(block.content);
							this.emitter.emit({
								type: "agent:tool_result",
								agent: config.role,
								tool: lastToolName,
								result: content,
							});
						}
					}
				}

				if (msg.type === "result") {
					resultText = msg.result ?? "";
					if (resultText) {
						this.emitter.emit({ type: "agent:output", agent: config.role, line: resultText });
					}
				}
			}

			const durationMs = Date.now() - startTime;
			this.emitter.emit({ type: "agent:exit", agent: config.role, exitCode: 0, durationMs });
			return { exitCode: 0, stdout: resultText, stderr: "" };
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const message = err instanceof Error ? err.message : String(err);
			this.emitter.emit({ type: "error", message: `${config.role} failed: ${message}` });
			this.emitter.emit({ type: "agent:exit", agent: config.role, exitCode: 1, durationMs });
			return { exitCode: 1, stdout: "", stderr: message };
		}
	}
}
```

Key changes from the old file:
- Removed `child_process` import and `spawn()` call
- Removed `buildArgs()` method and `claudeBinary` constructor parameter
- Added `query()` import from SDK
- Message stream loop emits `agent:tool_call` and `agent:tool_result`
- Final result text emitted as `agent:output` (for verbose mode)
- Error handling via try/catch instead of process error events

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: May show errors in test files (they still reference old API). Source should be clean.

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator/process-manager.ts
git commit -m "feat: rewrite ProcessManager to use Agent SDK

Replace child_process.spawn with sdk.query(). Parse message stream
for tool_call/tool_result events. Remove CLI flag building."
```

---

### Task 3: Extend TextRenderer with tool rendering

**Files:**
- Modify: `src/events/text-renderer.ts`

- [ ] **Step 1: Add tool rendering helper and pending tool buffer**

Add after the `formatDuration` function (after line 24), before the `TextRenderer` class:

```typescript
const TOOL_PREFIX = chalk.dim("▸");

function truncate(str: string, max: number): string {
	return str.length > max ? `${str.substring(0, max)}...` : str;
}

function extractToolSummary(tool: string, input: Record<string, unknown>): string {
	switch (tool) {
		case "Read":
			return `Read  ${input.file_path ?? ""}`;
		case "Edit":
			return `Edit  ${input.file_path ?? ""}`;
		case "Write":
			return `Write ${input.file_path ?? ""}`;
		case "Bash":
			return `Bash  ${truncate(String(input.command ?? ""), 60)}`;
		case "Glob":
			return `Glob  ${input.pattern ?? ""}`;
		case "Grep":
			return `Grep  ${input.pattern ?? ""}`;
		default:
			return tool;
	}
}

function extractResultSuffix(tool: string, result: string): string {
	switch (tool) {
		case "Write": {
			const lines = result.split("\n").length;
			return ` (${lines} lines)`;
		}
		case "Bash": {
			const lastLine = result.split("\n").filter(Boolean).pop() ?? "";
			return lastLine ? ` → ${truncate(lastLine, 80)}` : "";
		}
		case "Glob": {
			const count = result.split("\n").filter(Boolean).length;
			return ` → ${count} files`;
		}
		case "Grep": {
			const count = result.split("\n").filter(Boolean).length;
			return ` → ${count} matches`;
		}
		default:
			return "";
	}
}

const BUFFERED_TOOLS = new Set(["Write", "Bash", "Glob", "Grep"]);
```

- [ ] **Step 2: Add pendingToolCall field and update handle method**

Replace the `TextRenderer` class (from line 26 to end of file):

```typescript
export class TextRenderer {
	private unsub: () => void;
	private pendingToolCall: { agent: AgentRole; tool: string; input: Record<string, unknown> } | null =
		null;

	constructor(
		emitter: { on: (handler: (event: HarnessEvent) => void) => () => void },
		private verbosity: Verbosity,
		private output: OutputFn = console.log,
	) {
		this.unsub = emitter.on((event) => this.handle(event));
	}

	dispose(): void {
		this.flushPending();
		this.unsub();
	}

	private flushPending(): void {
		if (this.pendingToolCall) {
			const { agent, tool, input } = this.pendingToolCall;
			this.output(`${AGENT_PREFIX[agent]}${TOOL_PREFIX} ${extractToolSummary(tool, input)}`);
			this.pendingToolCall = null;
		}
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
			case "agent:tool_call": {
				this.flushPending();
				if (BUFFERED_TOOLS.has(event.tool)) {
					this.pendingToolCall = { agent: event.agent, tool: event.tool, input: event.input };
				} else {
					this.output(
						`${AGENT_PREFIX[event.agent]}${TOOL_PREFIX} ${extractToolSummary(event.tool, event.input)}`,
					);
				}
				break;
			}
			case "agent:tool_result": {
				if (this.pendingToolCall && this.pendingToolCall.tool === event.tool) {
					const { agent, tool, input } = this.pendingToolCall;
					const suffix = extractResultSuffix(tool, event.result);
					this.output(
						`${AGENT_PREFIX[agent]}${TOOL_PREFIX} ${extractToolSummary(tool, input)}${suffix}`,
					);
					this.pendingToolCall = null;
				}
				break;
			}
			case "agent:output":
				if (this.verbosity >= 1) {
					this.output(`${AGENT_PREFIX[event.agent]}${event.line}`);
				}
				break;
			case "agent:exit": {
				this.flushPending();
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
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/events/text-renderer.ts
git commit -m "feat: TextRenderer renders tool_call/tool_result events

Buffered rendering for Write/Bash/Glob/Grep waits for result.
Immediate rendering for Read/Edit/other tools."
```

---

### Task 4: Rewrite ProcessManager tests

**Files:**
- Rewrite: `tests/orchestrator/process-manager.test.ts`
- Delete: `tests/fixtures/mock-claude.sh`

- [ ] **Step 1: Rewrite the test file**

Replace `tests/orchestrator/process-manager.test.ts` with:

```typescript
import { describe, expect, it, vi } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";
import { ProcessManager } from "../../src/orchestrator/process-manager.js";

// Mock the SDK query function
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
	query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
const mockQuery = vi.mocked(query);

function createMockStream(messages: Array<Record<string, unknown>>) {
	return {
		async *[Symbol.asyncIterator]() {
			for (const msg of messages) {
				yield msg;
			}
		},
	};
}

describe("ProcessManager", () => {
	it("emits tool_call and tool_result from message stream", async () => {
		const emitter = new HarnessEmitter();
		const events: Array<{ type: string; [key: string]: unknown }> = [];
		emitter.on((e) => events.push(e));

		mockQuery.mockReturnValue(
			createMockStream([
				{
					type: "assistant",
					message: {
						content: [
							{ type: "tool_use", name: "Read", input: { file_path: "package.json" } },
						],
					},
				},
				{
					type: "user",
					message: {
						content: [
							{ type: "tool_result", tool_use_id: "t1", content: '{"name":"harnex"}' },
						],
					},
				},
				{ type: "result", result: "Done reading" },
			]) as ReturnType<typeof query>,
		);

		const pm = new ProcessManager(emitter);
		const result = await pm.spawn({
			role: "planner",
			systemPrompt: "/dev/null",
			allowedTools: ["Read"],
			inputPrompt: "Read package.json",
			workingDir: "/tmp",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("Done reading");

		const types = events.map((e) => e.type);
		expect(types).toContain("agent:tool_call");
		expect(types).toContain("agent:tool_result");
		expect(types).toContain("agent:output");
		expect(types).toContain("agent:exit");
		expect(types).not.toContain("agent:start");

		const toolCall = events.find((e) => e.type === "agent:tool_call");
		expect(toolCall).toMatchObject({ tool: "Read", agent: "planner" });

		const toolResult = events.find((e) => e.type === "agent:tool_result");
		expect(toolResult).toMatchObject({ tool: "Read", agent: "planner" });
	});

	it("handles SDK errors gracefully", async () => {
		const emitter = new HarnessEmitter();
		const events: Array<{ type: string; [key: string]: unknown }> = [];
		emitter.on((e) => events.push(e));

		mockQuery.mockReturnValue(
			(async function* () {
				throw new Error("Rate limit exceeded");
			})() as ReturnType<typeof query>,
		);

		const pm = new ProcessManager(emitter);
		const result = await pm.spawn({
			role: "evaluator",
			systemPrompt: "/dev/null",
			allowedTools: [],
			inputPrompt: "Evaluate",
			workingDir: "/tmp",
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Rate limit exceeded");

		const errorEvent = events.find((e) => e.type === "error");
		expect(errorEvent).toBeDefined();

		const exitEvent = events.find((e) => e.type === "agent:exit");
		expect(exitEvent).toMatchObject({ exitCode: 1 });
	});

	it("passes correct options to SDK query", async () => {
		const emitter = new HarnessEmitter();

		mockQuery.mockReturnValue(
			createMockStream([{ type: "result", result: "ok" }]) as ReturnType<typeof query>,
		);

		const pm = new ProcessManager(emitter);
		await pm.spawn({
			role: "generator",
			systemPrompt: "/dev/null",
			allowedTools: ["Read", "Write", "Bash"],
			maxTurns: 25,
			inputPrompt: "Generate code",
			workingDir: "/tmp",
		});

		expect(mockQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Generate code",
				options: expect.objectContaining({
					allowedTools: ["Read", "Write", "Bash"],
					maxTurns: 25,
					permissionMode: "bypassPermissions",
					cwd: "/tmp",
				}),
			}),
		);
	});
});
```

- [ ] **Step 2: Delete the mock shell script**

```bash
rm tests/fixtures/mock-claude.sh
```

If `tests/fixtures/` is now empty, remove it too:

```bash
rmdir tests/fixtures 2>/dev/null || true
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: ProcessManager tests pass. Text renderer tests should still pass (no changes yet to tests).

- [ ] **Step 4: Commit**

```bash
git add tests/orchestrator/process-manager.test.ts
git rm tests/fixtures/mock-claude.sh
git commit -m "test: rewrite ProcessManager tests to mock Agent SDK

Replace mock shell script with vi.mock of sdk.query().
Test tool_call/tool_result events, error handling, SDK options."
```

---

### Task 5: Add TextRenderer tool rendering tests

**Files:**
- Modify: `tests/events/text-renderer.test.ts`

- [ ] **Step 1: Add tool rendering tests**

Append the following tests inside the existing `describe("TextRenderer", ...)` block, after the last `it()` (after the "formats duration in hours" test):

```typescript
	it("renders Read tool_call immediately", () => {
		const { emitter, output } = setup();
		emitter.emit({
			type: "agent:tool_call",
			agent: "planner",
			tool: "Read",
			input: { file_path: "package.json" },
		});
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[PLAN]");
		expect(output[0]).toContain("▸");
		expect(output[0]).toContain("Read");
		expect(output[0]).toContain("package.json");
	});

	it("buffers Write tool_call and renders with result", () => {
		const { emitter, output } = setup();
		emitter.emit({
			type: "agent:tool_call",
			agent: "generator",
			tool: "Write",
			input: { file_path: "src/index.ts" },
		});
		expect(output).toHaveLength(0);

		emitter.emit({
			type: "agent:tool_result",
			agent: "generator",
			tool: "Write",
			result: "line1\nline2\nline3",
		});
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("Write");
		expect(output[0]).toContain("src/index.ts");
		expect(output[0]).toContain("3 lines");
	});

	it("buffers Bash tool_call and shows last line of result", () => {
		const { emitter, output } = setup();
		emitter.emit({
			type: "agent:tool_call",
			agent: "generator",
			tool: "Bash",
			input: { command: "pnpm test" },
		});
		expect(output).toHaveLength(0);

		emitter.emit({
			type: "agent:tool_result",
			agent: "generator",
			tool: "Bash",
			result: "running tests...\n\nTests: 12 passed (12)\n",
		});
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("Bash");
		expect(output[0]).toContain("pnpm test");
		expect(output[0]).toContain("Tests: 12 passed (12)");
	});

	it("renders Glob with file count", () => {
		const { emitter, output } = setup();
		emitter.emit({
			type: "agent:tool_call",
			agent: "planner",
			tool: "Glob",
			input: { pattern: "**/*.ts" },
		});
		emitter.emit({
			type: "agent:tool_result",
			agent: "planner",
			tool: "Glob",
			result: "src/a.ts\nsrc/b.ts\nsrc/c.ts",
		});
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("3 files");
	});

	it("flushes pending tool on agent:exit", () => {
		const { emitter, output } = setup();
		emitter.emit({
			type: "agent:tool_call",
			agent: "generator",
			tool: "Bash",
			input: { command: "echo hello" },
		});
		expect(output).toHaveLength(0);

		emitter.emit({ type: "agent:exit", agent: "generator", exitCode: 0, durationMs: 5000 });
		expect(output).toHaveLength(2);
		expect(output[0]).toContain("Bash");
		expect(output[1]).toContain("Done");
	});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/events/text-renderer.test.ts
git commit -m "test: add tool_call/tool_result rendering tests

Cover: Read immediate render, Write/Bash/Glob buffered render,
flush on agent:exit."
```

---

### Task 6: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: Clean. If not, fix with `pnpm lint:fix` on changed files.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Build and smoke test**

Run: `pnpm build && bash scripts/smoke-test.sh`
Expected: Build succeeds, smoke tests pass.

- [ ] **Step 5: Bump version and commit**

Edit `package.json` version to `0.1.8`.

```bash
git add package.json
git commit -m "chore: bump to v0.1.8 for Agent SDK migration"
```

- [ ] **Step 6: Publish and push**

```bash
pnpm publish --access public
git push
```
