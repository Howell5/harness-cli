import { describe, expect, it } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";
import { TextRenderer } from "../../src/events/text-renderer.js";

describe("TextRenderer", () => {
	it("renders harness:start with [HARNESS] prefix", () => {
		const emitter = new HarnessEmitter();
		const output: string[] = [];
		new TextRenderer(emitter, 0, (line) => output.push(line));
		emitter.emit({ type: "harness:start", task: "test task" });
		expect(output).toHaveLength(1);
		expect(output[0]).toContain("[HARNESS]");
		expect(output[0]).toContain("test task");
	});

	it("renders agent:output only at verbosity >= 1", () => {
		const emitter = new HarnessEmitter();
		const output: string[] = [];
		new TextRenderer(emitter, 0, (line) => output.push(line));
		emitter.emit({ type: "agent:output", agent: "generator", line: "writing file" });
		expect(output).toHaveLength(0);

		const output2: string[] = [];
		const emitter2 = new HarnessEmitter();
		new TextRenderer(emitter2, 1, (line) => output2.push(line));
		emitter2.emit({ type: "agent:output", agent: "generator", line: "writing file" });
		expect(output2).toHaveLength(1);
		expect(output2[0]).toContain("[GEN]");
	});

	it("renders eval:score with score value", () => {
		const emitter = new HarnessEmitter();
		const output: string[] = [];
		new TextRenderer(emitter, 0, (line) => output.push(line));
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
});
