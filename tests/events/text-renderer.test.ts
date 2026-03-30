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
