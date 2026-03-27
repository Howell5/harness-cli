import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";
import { runHarnessLoop } from "../../src/orchestrator/loop.js";
import type { ProcessManager } from "../../src/orchestrator/process-manager.js";
import type { AgentConfig, AgentResult, HarnessConfig } from "../../src/types.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/loop");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function createMockPM(
	behaviors: Record<string, (config: AgentConfig) => Promise<AgentResult>>,
): Pick<ProcessManager, "spawn"> {
	return {
		spawn: vi.fn(async (config: AgentConfig) => {
			const behavior = behaviors[config.role];
			if (!behavior) throw new Error(`No mock for role: ${config.role}`);
			return behavior(config);
		}),
	};
}

describe("runHarnessLoop", () => {
	it("completes full plan-generate-evaluate cycle", async () => {
		const emitter = new HarnessEmitter();
		const events: string[] = [];
		emitter.on((e) => events.push(e.type));

		writeFileSync(
			join(TMP, "criteria.yaml"),
			`dimensions:
  - id: functionality
    weight: 0.4
    checklist: ["Works"]
  - id: code_quality
    weight: 0.35
    checklist: ["Clean"]
  - id: design_consistency
    weight: 0.25
    checklist: ["Consistent"]
passing_threshold: 7.5
`,
		);

		const pm = createMockPM({
			planner: async () => {
				writeFileSync(join(TMP, "spec.md"), "# Spec\nBuild a thing\n");
				writeFileSync(
					join(TMP, "feature-list.json"),
					JSON.stringify([{ id: "feat-001", desc: "Do thing", status: "pending" }]),
				);
				return { exitCode: 0, stdout: "done", stderr: "" };
			},
			generator: async () => {
				writeFileSync(
					join(TMP, "feature-list.json"),
					JSON.stringify([
						{ id: "feat-001", desc: "Do thing", status: "completed", commit: "abc" },
					]),
				);
				writeFileSync(join(TMP, "progress.txt"), "ALL_FEATURES_COMPLETE\n");
				return { exitCode: 0, stdout: "done", stderr: "" };
			},
			evaluator: async () => {
				writeFileSync(
					join(TMP, "scores.json"),
					JSON.stringify({ functionality: 9.0, code_quality: 8.5, design_consistency: 8.0 }),
				);
				writeFileSync(join(TMP, "feedback.md"), "# Feedback\nLooks good.\n");
				return { exitCode: 0, stdout: "done", stderr: "" };
			},
		});

		const config: HarnessConfig = {
			max_iterations: 5,
			passing_threshold: 7.5,
			generator: { max_turns: 50, allowed_tools: ["Read", "Write", "Bash"] },
			evaluator: { allowed_tools: ["Read", "Bash"], criteria_file: join(TMP, "criteria.yaml") },
			planner: { allowed_tools: ["Read", "Write"] },
			prompts: { planner: "/dev/null", generator: "/dev/null", evaluator: "/dev/null" },
		};

		const result = await runHarnessLoop({
			config,
			projectDir: TMP,
			spec: "Build a thing",
			emitter,
			processManager: pm as unknown as ProcessManager,
		});

		expect(result.success).toBe(true);
		expect(result.iterations).toBe(1);
		expect(pm.spawn).toHaveBeenCalledTimes(3);
	});
});
