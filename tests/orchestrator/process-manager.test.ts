import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";
import { ProcessManager } from "../../src/orchestrator/process-manager.js";

const MOCK_CLAUDE = join(import.meta.dirname, "../fixtures/mock-claude.sh");

describe("ProcessManager", () => {
	it("spawns a process and captures output", async () => {
		const emitter = new HarnessEmitter();
		const events: string[] = [];
		emitter.on((e) => events.push(e.type));

		const pm = new ProcessManager(emitter, MOCK_CLAUDE);
		const result = await pm.spawn({
			role: "planner",
			systemPrompt: "/dev/null",
			allowedTools: ["Read", "Write"],
			inputPrompt: "Plan a todo app",
			workingDir: "/tmp",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Mock claude");
		expect(events).not.toContain("agent:start");
		expect(events).toContain("agent:output");
		expect(events).toContain("agent:exit");
	});

	it("passes max-turns flag", async () => {
		const emitter = new HarnessEmitter();
		const pm = new ProcessManager(emitter, MOCK_CLAUDE);
		const result = await pm.spawn({
			role: "generator",
			systemPrompt: "/dev/null",
			allowedTools: ["Read"],
			maxTurns: 25,
			inputPrompt: "Generate code",
			workingDir: "/tmp",
		});
		expect(result.stdout).toContain("MAX_TURNS: 25");
	});

	it("reports non-zero exit codes", async () => {
		const emitter = new HarnessEmitter();
		const pm = new ProcessManager(emitter, "false");
		const result = await pm.spawn({
			role: "evaluator",
			systemPrompt: "/dev/null",
			allowedTools: [],
			inputPrompt: "Evaluate",
			workingDir: "/tmp",
		});
		expect(result.exitCode).not.toBe(0);
	});
});
