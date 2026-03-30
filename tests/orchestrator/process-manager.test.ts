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
						content: [{ type: "tool_use", name: "Read", input: { file_path: "package.json" } }],
					},
				},
				{
					type: "user",
					message: {
						content: [{ type: "tool_result", tool_use_id: "t1", content: '{"name":"harnex"}' }],
					},
				},
				{ type: "result", subtype: "success", result: "Done reading" },
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
			// biome-ignore lint/correctness/useYield: intentionally throwing before yield
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
			createMockStream([{ type: "result", subtype: "success", result: "ok" }]) as ReturnType<
				typeof query
			>,
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
